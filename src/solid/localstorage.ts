import { onCleanup } from "solid-js";
import { type Store, type SetStoreFunction, createStore } from "solid-js/store";

// ==========================
// Types
// ==========================

type StoreItem<T> = T & { _key: string };

type Serializer = {
  serialize: (value: any) => string;
  deserialize: (raw: string) => any;
};

type LocalStoreQueryOptions<T extends Record<string, any>> = {
  storage?: Storage;
  enhanceRecord?: (item: StoreItem<T>) => StoreItem<T>;
};

type CreateLocalStoreOptions = {
  storage?: Storage;
  serializer?: Serializer;
};

type CreateLocalStoreResult<T extends Record<string, any>> = [
  Store<StoreItem<T>>,
  SetStoreFunction<StoreItem<T>>,
];

type CreateLocalStoreQueryResult<T extends Record<string, any>> = [
  Store<StoreItem<T>[]>,
  () => void,
];

type ListenerCallback = (key: string, value?: any) => void;
type KeyFilter = (key: string) => boolean;

// ==========================
// Default Serializer
// ==========================

const defaultSerializer: Serializer = {
  serialize: JSON.stringify,
  deserialize: JSON.parse,
};

// ==========================
// Internal Sync System
// ==========================

// Global BroadcastChannel used for cross-tab synchronization of localStorage changes.
// When a store is updated in one tab, a message is broadcast so other tabs can re-read
// the value from storage and update their reactive stores. Falls back to null in
// environments without BroadcastChannel support (e.g. SSR).
const globalChannel = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("localstorage-sync")
  : null;
const listeners = new Map<string | Function, Set<ListenerCallback>>();

/**
 * Subscribes a callback to notifications for a specific key or a key-matching filter function.
 * Returns an unsubscribe function.
 */
const subscribe = (
  keyOrFilter: string | KeyFilter,
  callback: ListenerCallback,
): (() => void) => {
  if (!listeners.has(keyOrFilter)) listeners.set(keyOrFilter, new Set());
  listeners.get(keyOrFilter)!.add(callback);
  return () => listeners.get(keyOrFilter)?.delete(callback);
};

/**
 * Notifies all subscribers matching the given key (exact-match and filter-function subscribers).
 * Also broadcasts the change to other tabs via BroadcastChannel, unless the notification
 * itself originated from a broadcast (to avoid infinite loops).
 */
const notify = (key: string, value?: any, __fromBroadcast = false): void => {
  listeners.get(key)?.forEach((callback) => callback(key, value));
  listeners.forEach((callbacks, keyOrFilter) => {
    if (typeof keyOrFilter === "function" && keyOrFilter(key)) {
      callbacks.forEach((callback) => callback(key, value));
    }
  });
  if (!__fromBroadcast) {
    setTimeout(() => globalChannel?.postMessage({ key }), 0);
  }
};

globalChannel?.addEventListener("message", (event) => {
  const { key } = event.data;
  notify(key, undefined, true);
});

// ==========================
// Public API
// ==========================

/**
 * Creates a reactive store with automatic localStorage persistence and cross-tab sync.
 *
 * The store object always contains an internal `_key` field holding the localStorage key.
 * Changes made via the returned `setStore` function are automatically persisted and
 * broadcast to other tabs. Changes from other tabs are received via BroadcastChannel
 * and update the local reactive store.
 *
 * @param key - Unique localStorage key for this store
 * @param defaultValue - Default value when storage is empty or invalid
 * @param options - Optional storage and serializer configuration
 * @returns A tuple containing [store, setStore]
 *
 * @example
 * const [user, setUser] = localStore.create("user", { name: "", email: "" });
 * setUser("name", "John"); // Automatically syncs across tabs
 */
const create = <T extends Record<string, any>>(
  key: string,
  defaultValue: T,
  options: CreateLocalStoreOptions = {},
): CreateLocalStoreResult<T> => {
  const { storage = localStorage, serializer = defaultSerializer } = options;

  const getInitialValue = (): StoreItem<T> => {
    try {
      const stored = storage.getItem(key);
      return stored
        ? (serializer.deserialize(stored) as StoreItem<T>)
        : { ...defaultValue, _key: key };
    } catch {
      return { ...defaultValue, _key: key };
    }
  };

  const [store, _setStore] = createStore<StoreItem<T>>(getInitialValue());

  const unsubscribe = subscribe(key, (_, value?: any) => {
    if (value === null) {
      _setStore({ ...defaultValue, _key: key });
    } else if (value) {
      _setStore(value);
    } else {
      const newValue = getInitialValue();
      _setStore(newValue);
    }
  });
  onCleanup(unsubscribe);

  const setStore: SetStoreFunction<StoreItem<T>> = (...args: any) => {
    const result = (_setStore as any)(...args);
    try {
      storage.setItem(key, serializer.serialize(store));
    } catch (error) {
      console.warn(`Failed to store ${key}:`, error);
      return result;
    }
    notify(key, store);
    return result;
  };

  return [store, setStore];
};

/**
 * Creates a reactive query that watches multiple localStorage keys.
 *
 * @param keysFilter - Optional function to filter which keys to include
 * @param options - Configuration options for storage and record enhancement
 * @returns A tuple containing [stores, reload]
 *
 * @example
 * const [pads] = localStore.query(key => key.startsWith("pad:"));
 */
const query = <T extends Record<string, any>>(
  keysFilter?: KeyFilter,
  options: LocalStoreQueryOptions<T> & { serializer?: Serializer } = {},
): CreateLocalStoreQueryResult<T> => {
  const { storage = localStorage, enhanceRecord, serializer = defaultSerializer } = options;

  const loadStores = (): StoreItem<T>[] =>
    Object.keys(storage)
      .filter((key) => (keysFilter ? keysFilter(key) : true))
      .map((key) => {
        try {
          const stored = storage.getItem(key);
          if (!stored) return null;
          const parsed = serializer.deserialize(stored) as T;
          const item = { ...parsed, _key: key };
          return enhanceRecord ? enhanceRecord(item) : item;
        } catch {
          return null;
        }
      })
      .filter((item) => item !== null);

  const [stores, setStores] = createStore<Array<StoreItem<T>>>(loadStores());
  const reload = () => setStores(loadStores());

  const unsubscribe = subscribe(keysFilter || (() => true), () => reload());
  onCleanup(unsubscribe);

  return [stores, reload];
};

/**
 * Deletes a key from localStorage and notifies all stores/queries.
 */
const remove = (key: string, storage: Storage = localStorage): void => {
  storage.removeItem(key);
  notify(key, null);
};

/**
 * Directly modifies a localStorage key and notifies all stores/queries.
 */
const modify = <T extends Record<string, any>>(
  key: string,
  value: T | ((prev?: T) => T),
  options: { storage?: Storage; serializer?: Serializer } = {},
): void => {
  const { storage = localStorage, serializer = defaultSerializer } = options;
  if (typeof value === "function") {
    value = value(read<T>(key, { storage, serializer }) ?? undefined);
  }
  const storeValue = { ...value, _key: key };
  storage.setItem(key, serializer.serialize(storeValue));
  notify(key, storeValue);
};

/**
 * Checks if a key exists in localStorage.
 */
const exists = (key: string, storage: Storage = localStorage): boolean =>
  storage.getItem(key) !== null;

/**
 * Reads a value from localStorage.
 */
const read = <T extends Record<string, any>>(
  key: string,
  options: { storage?: Storage; serializer?: Serializer } = {},
): T | null => {
  const { storage = localStorage, serializer = defaultSerializer } = options;
  const item = storage.getItem(key);
  if (!item) return null;
  try {
    return serializer.deserialize(item);
  } catch (error) {
    console.error(`Failed to parse localStorage item "${key}":`, error);
    return null;
  }
};

export const localStore = {
  create,
  query,
  remove,
  modify,
  exists,
  read,
} as const;
