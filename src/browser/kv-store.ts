/**
 * Persistent key-value store backed by the Origin Private File System (OPFS).
 *
 * Think of it as `localStorage`, but async and without the 5 MB size limit.
 * Store structured JSON data or large binary blobs — from user settings to
 * multi-gigabyte files waiting to be processed. Data persists across sessions
 * and is scoped to the current origin.
 *
 * Key features:
 * - **No size limit** — bounded only by available disk space.
 * - **Binary support** — store raw `Uint8Array` data without serialisation overhead.
 * - **O(1) lookups** — `has`, `keys`, `meta`, and `size` resolve from an in-memory
 *   index and never touch the disk after initial load.
 * - **Concurrency-safe** — Web Locks serialise writes; reads are lock-free.
 * - **Cross-tab aware** — a `BroadcastChannel` keeps every tab's cache in sync.
 * - **Namespace-friendly** — use key prefixes (`"images:"`, `"cache:"`) and query
 *   them with `keys(prefix)`.
 *
 * Small values (≤ 4 KB) are stored inline in the index file so thousands of
 * entries only create a single OPFS file. Larger values spill into individual
 * blob files for efficient random access.
 *
 * @example
 * import { kvStore } from "@valentinkolb/stdlib/browser";
 *
 * // Structured data (JSON)
 * await kvStore.set("user:1", { name: "Alice", age: 30 });
 * const user = await kvStore.get<{ name: string }>("user:1");
 *
 * // Binary data
 * await kvStore.setBytes("files:photo.raw", largeUint8Array);
 * const photo = await kvStore.getBytes("files:photo.raw");
 *
 * // Fast key operations (O(1), from in-memory index)
 * await kvStore.has("user:1");           // true
 * await kvStore.keys("user:");           // ["user:1"]
 * await kvStore.size();                  // 2
 *
 * // Watch for changes (same tab + cross-tab via BroadcastChannel)
 * const unwatch = kvStore.watch((e) => console.log(e), "files:");
 */

import { OPFS } from "./files";
import { toBase64, fromBase64 } from "../encoding";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type KVEntryMeta = {
  key: string;
  size: number;
  timestamp: number;
  type: "json" | "bin";
};

export type KVEvent = {
  type: "set" | "delete" | "clear";
  key: string;
};

type IndexEntry = {
  key: string;
  ts: number;
  size: number;
  type: "json" | "bin";
  inline?: string;
};

type StoreIndex = {
  v: number;
  entries: Record<string, IndexEntry>;
};

type CacheItem = { hash: string; entry: IndexEntry };

type WatcherEntry = { cb: (event: KVEvent) => void; prefix?: string };

// ─── Constants ──────────────────────────────────────────────────────────────────

const STORE_DIR = ".kvstore";
const INDEX_PATH = `${STORE_DIR}/_index.json`;
const BLOBS_DIR = `${STORE_DIR}/blobs`;
const INLINE_THRESHOLD = 4096;
const LOCK_NAME = "kvstore-index";
const BC_NAME = "kvstore-sync";

// ─── State ──────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

/** In-memory index: original key → { hash, entry }. Null until first access. */
let cache: Map<string, CacheItem> | null = null;
let indexVersion = 0;

const watchers = new Set<WatcherEntry>();
let bc: BroadcastChannel | null = null;

// ─── Internals: Hashing ─────────────────────────────────────────────────────────

/**
 * SHA-256 hash of a key string, returned as lowercase hex.
 * Used as the blob filename and index key on disk.
 */
const hashKey = async (key: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(key));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
};

// ─── Internals: Locking ─────────────────────────────────────────────────────────

/**
 * Acquire a Web Lock (exclusive) for the duration of `fn`.
 * Falls back to direct invocation when Web Locks are unavailable.
 */
const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request(LOCK_NAME, fn);
  }
  return fn();
};

// ─── Internals: Index Persistence ───────────────────────────────────────────────

/** Load the index from OPFS. Returns an empty index on missing/corrupt file. */
const loadIndex = async (): Promise<StoreIndex> => {
  try {
    const data = await OPFS.read(INDEX_PATH);
    if (data) return JSON.parse(dec.decode(data)) as StoreIndex;
  } catch { /* missing or corrupt — start fresh */ }
  return { v: 0, entries: {} };
};

/** Persist the current in-memory cache to OPFS as the new index. */
const saveIndex = async (): Promise<void> => {
  const entries: Record<string, IndexEntry> = {};
  for (const [, { hash, entry }] of cache!) {
    entries[hash] = entry;
  }
  indexVersion++;
  const index: StoreIndex = { v: indexVersion, entries };
  await OPFS.write(INDEX_PATH, enc.encode(JSON.stringify(index)));
};

/** Build the in-memory cache from a disk index. */
const rebuildCache = (index: StoreIndex): void => {
  cache = new Map();
  for (const [hash, entry] of Object.entries(index.entries)) {
    cache.set(entry.key, { hash, entry });
  }
  indexVersion = index.v;
};

/**
 * Ensure the in-memory cache is populated.
 * First call loads from disk; subsequent calls return immediately.
 */
const ensureCache = async (): Promise<Map<string, CacheItem>> => {
  if (cache === null) {
    rebuildCache(await loadIndex());
    initBC();
  }
  return cache!;
};

// ─── Internals: Cross-Tab Sync ──────────────────────────────────────────────────

/** Initialise the BroadcastChannel for cross-tab cache invalidation (idempotent). */
const initBC = (): void => {
  if (bc !== null || typeof BroadcastChannel === "undefined") return;
  bc = new BroadcastChannel(BC_NAME);
  bc.onmessage = (msg: MessageEvent) => {
    const event = msg.data;
    if (event && typeof event.type === "string" && typeof event.key === "string") {
      cache = null; // Force reload on next access
      notifyWatchers(event as KVEvent);
    }
  };
};

// ─── Internals: Watchers ────────────────────────────────────────────────────────

/** Notify all matching watchers of an event. Watcher errors are silently ignored. */
const notifyWatchers = (event: KVEvent): void => {
  for (const w of watchers) {
    if (!w.prefix || event.key.startsWith(w.prefix)) {
      try { w.cb(event); } catch { /* ignore */ }
    }
  }
};

/** Notify local watchers and broadcast to other tabs. */
const emit = (event: KVEvent): void => {
  notifyWatchers(event);
  bc?.postMessage(event);
};

// ─── Internals: Blob Cleanup ────────────────────────────────────────────────────

/** Delete an old blob file if the entry was stored externally (not inline). */
const cleanupBlob = async (item: CacheItem | undefined): Promise<void> => {
  if (item && item.entry.inline === undefined) {
    try { await OPFS.delete(`${BLOBS_DIR}/${item.hash}`); } catch { /* already gone */ }
  }
};

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Store a JSON-serialisable value.
 *
 * The value is serialised with `JSON.stringify`. Values ≤ 4 KB are stored inline
 * in the index; larger values are written to a separate blob file.
 * Overwrites any previous entry under the same key (regardless of type).
 *
 * @throws If `JSON.stringify` fails (e.g. circular reference).
 *
 * @example
 * await kvStore.set("user:1", { name: "Alice", age: 30 });
 * await kvStore.set("prefs", { theme: "dark" });
 */
export const set = async (key: string, value: unknown): Promise<void> => {
  const hash = await hashKey(key);
  const serialized = JSON.stringify(value);
  const bytes = enc.encode(serialized);

  await withLock(async () => {
    rebuildCache(await loadIndex());
    await cleanupBlob(cache!.get(key));

    const entry: IndexEntry = { key, ts: Date.now(), size: bytes.length, type: "json" };

    if (bytes.length <= INLINE_THRESHOLD) {
      entry.inline = serialized;
    } else {
      await OPFS.write(`${BLOBS_DIR}/${hash}`, bytes);
    }

    cache!.set(key, { hash, entry });
    await saveIndex();
  });

  emit({ type: "set", key });
};

/**
 * Store raw binary data.
 *
 * The bytes are written as-is, without any serialisation. Data ≤ 4 KB is stored
 * inline (base64-encoded) in the index; larger data gets its own blob file.
 * Overwrites any previous entry under the same key (regardless of type).
 *
 * @example
 * const response = await fetch("/large-dataset.bin");
 * await kvStore.setBytes("data:raw", new Uint8Array(await response.arrayBuffer()));
 */
export const setBytes = async (key: string, data: Uint8Array): Promise<void> => {
  const hash = await hashKey(key);

  await withLock(async () => {
    rebuildCache(await loadIndex());
    await cleanupBlob(cache!.get(key));

    const entry: IndexEntry = { key, ts: Date.now(), size: data.length, type: "bin" };

    if (data.length <= INLINE_THRESHOLD) {
      entry.inline = toBase64(data);
    } else {
      await OPFS.write(`${BLOBS_DIR}/${hash}`, data);
    }

    cache!.set(key, { hash, entry });
    await saveIndex();
  });

  emit({ type: "set", key });
};

/**
 * Retrieve a JSON value by key.
 *
 * Returns `undefined` if the key does not exist or was stored with `setBytes`.
 * The value is deserialised with `JSON.parse`. No lock is acquired — reads are
 * always non-blocking.
 *
 * @example
 * const user = await kvStore.get<{ name: string }>("user:1");
 * if (user) console.log(user.name);
 */
export const get = async <T = unknown>(key: string): Promise<T | undefined> => {
  const c = await ensureCache();
  const item = c.get(key);
  if (!item || item.entry.type !== "json") return undefined;

  if (item.entry.inline !== undefined) {
    try { return JSON.parse(item.entry.inline) as T; } catch { return undefined; }
  }

  const data = await OPFS.read(`${BLOBS_DIR}/${item.hash}`);
  if (!data) return undefined;
  try { return JSON.parse(dec.decode(data)) as T; } catch { return undefined; }
};

/**
 * Retrieve raw binary data by key.
 *
 * Returns `undefined` if the key does not exist or was stored with `set`.
 * No lock is acquired — reads are always non-blocking.
 *
 * @example
 * const photo = await kvStore.getBytes("files:photo.raw");
 * if (photo) processImage(photo);
 */
export const getBytes = async (key: string): Promise<Uint8Array | undefined> => {
  const c = await ensureCache();
  const item = c.get(key);
  if (!item || item.entry.type !== "bin") return undefined;

  if (item.entry.inline !== undefined) {
    try { return fromBase64(item.entry.inline); } catch { return undefined; }
  }

  return OPFS.read(`${BLOBS_DIR}/${item.hash}`);
};

/**
 * Check whether a key exists in the store.
 *
 * Resolves from the in-memory index — no disk I/O after initial load.
 *
 * @example
 * if (await kvStore.has("user:1")) { ... }
 */
export const has = async (key: string): Promise<boolean> => {
  const c = await ensureCache();
  return c.has(key);
};

/**
 * List all keys, optionally filtered by a prefix.
 *
 * Resolves from the in-memory index — no disk I/O after initial load.
 * Results are sorted alphabetically.
 *
 * @example
 * const allKeys = await kvStore.keys();
 * const userKeys = await kvStore.keys("user:");      // ["user:1", "user:2"]
 * const cacheKeys = await kvStore.keys("cache:");    // ["cache:api:token"]
 */
export const keys = async (prefix?: string): Promise<string[]> => {
  const c = await ensureCache();
  const all = Array.from(c.keys());
  const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  return filtered.sort();
};

/**
 * Read entry metadata without loading the value.
 *
 * Resolves from the in-memory index — no disk I/O after initial load.
 * Returns `undefined` if the key does not exist.
 *
 * @example
 * const info = await kvStore.meta("files:photo.raw");
 * if (info) console.log(`${info.key}: ${info.size} bytes, type=${info.type}`);
 */
export const meta = async (key: string): Promise<KVEntryMeta | undefined> => {
  const c = await ensureCache();
  const item = c.get(key);
  if (!item) return undefined;
  return { key: item.entry.key, size: item.entry.size, timestamp: item.entry.ts, type: item.entry.type };
};

/**
 * Return the number of entries in the store.
 *
 * Resolves from the in-memory index — no disk I/O after initial load.
 */
export const size = async (): Promise<number> => {
  const c = await ensureCache();
  return c.size;
};

/**
 * Delete a key and its associated data.
 *
 * No-op if the key does not exist. Blob files are removed from disk; inline
 * entries are removed from the index.
 *
 * @example
 * await kvStore.delete("user:1");
 */
const del = async (key: string): Promise<void> => {
  await withLock(async () => {
    rebuildCache(await loadIndex());
    const item = cache!.get(key);
    if (!item) return;

    await cleanupBlob(item);
    cache!.delete(key);
    await saveIndex();
  });

  emit({ type: "delete", key });
};

/**
 * Delete all entries and remove the store directory from OPFS.
 *
 * The store is immediately usable again after clearing — the next write
 * recreates the directory structure automatically.
 *
 * @example
 * await kvStore.clear();
 */
const clearStore = async (): Promise<void> => {
  await withLock(async () => {
    try { await OPFS.delete(STORE_DIR); } catch { /* already empty */ }
    cache = new Map();
    indexVersion = 0;
  });

  emit({ type: "clear", key: "" });
};

/**
 * Watch for store mutations, optionally filtered by a key prefix.
 *
 * The callback fires for changes made in the current tab (immediately after the
 * mutation) and for changes made in other tabs (via BroadcastChannel, best-effort).
 * Returns an unsubscribe function.
 *
 * The event does not contain the value — call `get` / `getBytes` inside the
 * callback if you need the new value.
 *
 * @example
 * const unwatch = kvStore.watch((e) => {
 *   console.log(`${e.type}: ${e.key}`);
 *   if (e.type === "set") refreshUI();
 * }, "user:");
 *
 * // Later: stop watching
 * unwatch();
 */
export const watch = (callback: (event: KVEvent) => void, prefix?: string): (() => void) => {
  const entry: WatcherEntry = { cb: callback, prefix };
  watchers.add(entry);
  initBC();
  return () => { watchers.delete(entry); };
};

// ─── Namespace Export ────────────────────────────────────────────────────────────

/**
 * Persistent key-value store backed by OPFS — like `localStorage` without size limits.
 *
 * Use `set` / `get` for JSON data and `setBytes` / `getBytes` for binary data.
 * Key operations (`has`, `keys`, `meta`, `size`) are O(1) from an in-memory index.
 * Use key prefixes for namespacing (e.g. `"user:"`, `"cache:"`).
 */
export const kvStore = {
  set,
  get,
  setBytes,
  getBytes,
  has,
  keys,
  meta,
  size,
  delete: del,
  clear: clearStore,
  watch,
} as const;
