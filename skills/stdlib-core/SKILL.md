---
name: stdlib-core
description: >
  ALWAYS use when code imports from "@valentinkolb/stdlib" or when the user needs
  encoding (Base64/Hex/Base32/Base62), hashing (SHA-256, FNV-1a), cryptography (asymmetric
  ECDSA+ECDH key pairs, symmetric AES-256-GCM encryption, TOTP two-factor auth),
  password generation and strength analysis (random, memorable, PIN, strength), date/time formatting (UTC dates,
  relative time, durations, time spans), calendar utilities (month/week grids,
  date range calculation, item filtering, navigation helpers), timing helpers
  (sleep, buffer, jitter, random, shuffle, withMinLoadTime, debounce, throttle),
  streaming (SSE parsing, NDJSON parsing), text manipulation
  (slugify, humanize, titleify, pprintBytes, truncate, summarize, camelCase,
  snakeCase, kebabCase, pascalCase), in-memory TTL caching with lazy
  loading, Result/ServiceError types for service layer error handling, QR code
  generation (WiFi, email, tel, vCard, calendar events, SVG rendering),
  SVG avatar generation, WebP data URL parsing, URL search parameter
  serialization/deserialization, file icon/category lookup, or CSS gradient
  presets. This skill contains the COMPLETE API reference for every function
  in the @valentinkolb/stdlib core package.
---

# @valentinkolb/stdlib -- Core Modules

All imports come from the root entrypoint:

```ts
import { encoding, crypto, password, dates, calendar, timing, streaming, text, cache, result, qr, svg, searchParams, fileIcons, gradients } from "@valentinkolb/stdlib";
```

Every namespace is also a plain object, so you can destructure or use dot-access:

```ts
import { toBase64, fromBase64, ok, fail, err, parseSSE, parseNDJSON } from "@valentinkolb/stdlib";
```

---

## encoding

Binary encoding/decoding for Base64, Hex, and Base32. All functions work in both Node.js/Bun (uses `Buffer` when available) and browsers.

### API

```ts
encoding.toBase64(bytes: Uint8Array): string
encoding.fromBase64(base64: string): Uint8Array

encoding.toHex(bytes: Uint8Array): string          // lowercase, no "0x" prefix
encoding.fromHex(hex: string): Uint8Array           // case-insensitive, throws on odd length

encoding.toBase32(bytes: Uint8Array): string        // RFC 4648, uppercase, "=" padded
encoding.fromBase32(base32: string): Uint8Array     // case-insensitive, padding optional

encoding.toBase62(num: number, minLength?: number): string   // 0-9A-Za-z, URL-safe
encoding.fromBase62(str: string): number                      // inverse of toBase62
```

### Examples

```ts
import { encoding } from "@valentinkolb/stdlib";

const bytes = new TextEncoder().encode("hello");
encoding.toBase64(bytes);  // "aGVsbG8="
encoding.toHex(bytes);     // "68656c6c6f"
encoding.toBase32(bytes);  // "NBSWY3DP"

encoding.fromBase64("aGVsbG8=");   // Uint8Array
encoding.fromHex("cafe");          // Uint8Array([0xca, 0xfe])
encoding.fromBase32("NBSWY3DP");   // Uint8Array

encoding.toBase62(123456789);       // "8M0kX"
encoding.toBase62(42, 6);           // "000010" (zero-padded to 6 chars)
encoding.fromBase62("8M0kX");       // 123456789
```

### Gotchas
- `fromHex` throws on odd-length strings and non-hex characters.
- `fromBase32` throws on characters outside A-Z, 2-7.
- `toBase62` uses the charset `0-9A-Za-z`. `fromBase62` throws on invalid characters.
- Uses native `Uint8Array.toHex`/`fromHex` when available (modern runtimes).

---

## crypto

Cryptographic utilities organized into sub-namespaces: `common`, `asymmetric`, `symmetric`, `totp`. Password generation has moved to the separate `password` module (see below).

### crypto.common

```ts
crypto.common.hash(input: string | Uint8Array): Promise<string>   // SHA-256, returns hex
crypto.common.fnv1aHash(s: string): string                        // sync FNV-1a, NOT cryptographic
crypto.common.readableId(...pattern: number[]): string             // e.g. readableId() => "a3X-B7nm-4Kp-qR9v"
crypto.common.uuid(): string                                       // crypto.randomUUID() wrapper
crypto.common.generateKey(length?: number): string                 // random hex key, default 32 bytes (256-bit)
```

```ts
import { crypto } from "@valentinkolb/stdlib";

await crypto.common.hash("hello");       // "2cf24dba5fb0a30e..."
crypto.common.fnv1aHash("hello");        // "4f9f2cab"
crypto.common.readableId();              // "a3X-B7nm-4Kp-qR9v"
crypto.common.readableId(5, 5);          // "3nK4p-Xm9Bq"
crypto.common.uuid();                    // "550e8400-e29b-..."
const key = crypto.common.generateKey(); // 64-char hex string
```

### crypto.asymmetric

Hybrid ECDSA (signing) + ECDH (encryption) on P-256. Keys are serialized as `"S01:<ecdsa>:<ecdh>"` (private) and `"P01:<ecdsa>:<ecdh>"` (public).

```ts
crypto.asymmetric.generate(): Promise<{ privateKey: string; publicKey: string }>

crypto.asymmetric.sign(data: { privateKey: string; message: string }): Promise<{ nonce: string; timestamp: number; signature: string }>

crypto.asymmetric.verify(data: {
  publicKey: string; signature: string; nonce: string;
  timestamp: number; message: string; maxAge?: number
}): Promise<boolean>

crypto.asymmetric.encrypt(data: { payload: string; publicKey: string }): Promise<string>
crypto.asymmetric.decrypt(data: { payload: string; privateKey: string }): Promise<string>
```

```ts
import { crypto } from "@valentinkolb/stdlib";

// Generate key pair
const { privateKey, publicKey } = await crypto.asymmetric.generate();

// Sign + verify
const sig = await crypto.asymmetric.sign({ privateKey, message: "hello" });
const valid = await crypto.asymmetric.verify({
  publicKey, signature: sig.signature,
  nonce: sig.nonce, timestamp: sig.timestamp, message: "hello"
});

// Encrypt + decrypt
const encrypted = await crypto.asymmetric.encrypt({ payload: "secret", publicKey });
const decrypted = await crypto.asymmetric.decrypt({ payload: encrypted, privateKey });
```

**Gotchas:**
- `verify` rejects signatures >1 hour old (configurable via `maxAge`), and >30s in the future (clock skew).
- `verify` never throws -- returns `false` on any crypto failure.
- Each `encrypt` call generates an ephemeral key pair, so the same plaintext encrypts differently each time.

### crypto.symmetric

AES-256-GCM encryption. Supports both password-based (PBKDF2, 100k iterations) and key-based (HKDF) derivation.

```ts
crypto.symmetric.encrypt(data: { payload: string; key: string; stretched?: boolean }): Promise<string>
// stretched=true (default): PBKDF2 for user passwords
// stretched=false: HKDF for high-entropy keys (e.g. from generateKey)

crypto.symmetric.decrypt(data: { payload: string; key: string }): Promise<string>
// Auto-detects derivation method from the encrypted blob
```

```ts
import { crypto } from "@valentinkolb/stdlib";

// Password-based (slow, safe for user passwords)
const enc = await crypto.symmetric.encrypt({ payload: "secret", key: "user-password" });
const dec = await crypto.symmetric.decrypt({ payload: enc, key: "user-password" });

// Key-based (fast, for server-side keys)
const key = crypto.common.generateKey();
const enc2 = await crypto.symmetric.encrypt({ payload: "data", key, stretched: false });
const dec2 = await crypto.symmetric.decrypt({ payload: enc2, key });
```

### crypto.totp

RFC 6238 TOTP (Time-based One-Time Password) for two-factor authentication.

```ts
crypto.totp.create(data: { label: string; issuer: string }): Promise<{ uri: string; secret: string }>
// uri = otpauth:// URI for QR provisioning
// secret = Base32 encoded shared secret (encrypt before storing!)

crypto.totp.verify(data: { token: string; secret: string; window?: number }): Promise<boolean>
// window (default 1) = how many 30-second steps to check on each side
```

```ts
import { crypto } from "@valentinkolb/stdlib";

// Setup: generate secret, show QR code of uri to user
const { uri, secret } = await crypto.totp.create({ label: "user@example.com", issuer: "MyApp" });

// Store secret encrypted:
const encryptedSecret = await crypto.symmetric.encrypt({ payload: secret, key: serverKey, stretched: false });

// Verify user's 6-digit code:
const ok = await crypto.totp.verify({ token: "123456", secret });
```

**Gotchas:**
- Uses SHA-1 (required by the TOTP spec), 6 digits, 30-second period.
- Uses constant-time comparison to prevent timing attacks.
- Never throws -- returns `false` on invalid Base32 or crypto errors.

---

## password

Password generation and strength analysis. Separated from crypto for tree-shaking -- the 5KB EFF wordlist is only loaded when you import `password`.

### Types

```ts
type PasswordStrength = {
  entropy: number;       // bits of entropy
  score: number;         // 0-4 (0 = very weak, 4 = very strong)
  label: string;         // "very weak" | "weak" | "fair" | "strong" | "very strong"
  crackTime: string;     // human-readable crack time estimate, e.g. "centuries"
  feedback: string[];    // improvement suggestions, empty when strong
};
```

### API

```ts
password.random(options?: RandomPasswordOptions): string
// options: { length?: number (4-64, default 20), uppercase?: boolean (true), numbers?: boolean (true), symbols?: boolean (false) }

password.memorable(options?: MemorablePasswordOptions): string
// options: { words?: number (3-10, default 4), capitalize?: boolean (false), fullWords?: boolean (true), separator?: string ("-"), addNumber?: boolean (false), addSymbol?: boolean (false) }

password.pin(options?: PinPasswordOptions): string
// options: { length?: number (3-12, default 6) }

password.strength(pw: string): PasswordStrength
// Analyses entropy, estimates crack time, returns score and actionable feedback.
```

### Examples

```ts
import { password } from "@valentinkolb/stdlib";

password.random();                                    // "aB3kLm9xQr2Wp5Nj7Ht"
password.random({ length: 32, symbols: true });       // includes !@#$%^&*...
password.memorable();                                 // "correct-horse-battery-staple"
password.memorable({ capitalize: true, addNumber: true }); // "Correct-Horse-7-Battery-Staple"
password.pin();                                       // "384729"
password.pin({ length: 8 });                          // "38472916"

// Strength analysis
const strong = password.strength("correct-horse-battery-staple");
// { entropy: 41.36, score: 3, label: "strong", crackTime: "centuries", feedback: [] }

const weak = password.strength("password123");
// { entropy: 12.7, score: 1, label: "weak", crackTime: "seconds", feedback: ["Add more characters", ...] }
```

**Gotchas:**
- The memorable generator uses the EFF Short Wordlist 1 (1,296 words, 10.34 bits/word).
- `strength` is a pure synchronous function -- no crypto calls involved.
- `random` and `pin` use `crypto.getRandomValues` (cryptographically secure).

---

## dates

UTC-based date formatting. All functions accept `string | Date` and are timezone-independent (UTC methods).

### API

```ts
dates.formatDate(input: string | Date): string              // "05 Mar 2025"
dates.formatDateTime(input: string | Date): string           // "05 Mar 2025, 13:53"
dates.formatDateTimeRelative(input: string | Date): string   // "just now", "4 mins ago", "Yesterday", "Mon", or formatDate
dates.formatDateRelative(input: string | Date): string       // "14:30" (today), "Yesterday", "Mon", or formatDate
dates.formatTimeSpan(input: string | Date, base?: string | Date): string  // Intl.RelativeTimeFormat: "in 3 days", "2 hours ago"
dates.formatDuration(from: string | Date, to: string | Date): string      // "2 hours 15 minutes", "1 day 3 hours"
```

### Examples

```ts
import { dates } from "@valentinkolb/stdlib";

dates.formatDate("2025-03-05T13:53:00Z");          // "05 Mar 2025"
dates.formatDateTime("2025-03-05T13:53:00Z");       // "05 Mar 2025, 13:53"
dates.formatDateTimeRelative(new Date());            // "just now"
dates.formatDateRelative(new Date());                // "14:30" (current UTC time)
dates.formatDuration("2025-01-01", "2025-01-02T03:30:00Z"); // "1 day 3 hours"
```

### Relative time buckets (formatDateTimeRelative)
- < 5s: "just now"
- < 1min: "12 secs ago"
- < 1h: "4 mins ago"
- < 24h: "2 hours ago"
- < 48h: "Yesterday"
- < 7d: weekday name ("Mon")
- >= 7d or future: falls back to formatDate

---

## calendar

Calendar grid generation and date utilities. Uses native Intl.DateTimeFormat with locale parameter support. Weeks are ISO (Monday-first).

### Types

```ts
type CalendarItemLike = { startsAt: string | null; endsAt: string | null; deadline: string | null };
type CalendarUrlParams = { view?: "month" | "week"; date?: Date; item?: string };
```

### API

```ts
// Grid generation
calendar.getMonthGrid(year: number, month: number): Date[][]   // month is 0-indexed, returns 4-6 weeks of 7 days
calendar.getWeekDays(date: Date): Date[]                        // 7 days, Monday-Sunday

// Date ranges
calendar.getDateRange(view: "month" | "week", date: Date): { from: Date; to: Date }

// Item filtering
calendar.itemOnDate(item: CalendarItemLike, date: Date): boolean
calendar.getDayItems<T extends CalendarItemLike>(items: T[], date: Date): T[]

// Date checks
calendar.isToday(date: Date): boolean
calendar.isSameMonth(date: Date, refDate: Date): boolean
calendar.isSameDay(a: Date, b: Date): boolean

// Formatting
calendar.formatMonthYear(date: Date): string          // "March 2025"
calendar.formatDayNumber(date: Date): string           // "9"
calendar.formatWeekdayShort(date: Date): string        // "Mo"
calendar.formatWeekdayLong(date: Date): string         // "Wednesday"
calendar.formatFullDate(date: Date): string            // "9. March 2025"
calendar.formatDateShort(date: Date): string           // "9.3."
calendar.formatDateKey(date: Date): string             // "2025-03-09"
calendar.formatTime(iso: string): string               // "14:30"

// Navigation
calendar.addMonths(date: Date, n: number): Date
calendar.addWeeks(date: Date, n: number): Date
calendar.addDays(date: Date, n: number): Date
calendar.startOfMonth(date: Date): Date
calendar.startOfWeek(date: Date): Date                 // Monday (ISO)
calendar.today(): Date                                 // start of current day

// Constants
calendar.WEEKDAYS_SHORT: string[]                      // ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
calendar.MONTHS: string[]                              // ["January","February",...,"December"]
calendar.getYearOptions(): number[]                    // current year +/- 5

// URL helpers
calendar.buildCalendarUrl(baseUrl: string, params: CalendarUrlParams): string
calendar.parseCalendarDate(param: string | undefined): Date
```

### Examples

```ts
import { calendar } from "@valentinkolb/stdlib";

const weeks = calendar.getMonthGrid(2025, 2);  // March 2025
// weeks[0] = [Mon, Tue, Wed, Thu, Fri, Sat, Sun]

const range = calendar.getDateRange("month", new Date());
// { from: Date, to: Date } -- full month incl. padding days

const items = calendar.getDayItems(allItems, new Date());
// only items that overlap today

const nextMonth = calendar.addMonths(new Date(), 1);
```

**Gotchas:**
- `month` parameter is 0-indexed (0 = January).
- `WEEKDAYS_SHORT` is Monday-first (ISO). Do NOT index with `Date.getDay()` which is Sunday-first.
- `getMonthGrid` includes padding days from adjacent months.

---

## timing

Async timing primitives.

### API

```ts
timing.sleep(ms: number): Promise<void>

timing.withMinLoadTime<T>(fn: () => Promise<T>, minMs?: number): Promise<T>
// Ensures fn takes at least minMs (default 300ms). Prevents UI flicker.

timing.buffer<T>(fn: (key: string, data: T) => Promise<void>, intervalMs?: number): (key: string, data: T) => void
// Write-coalescing buffer. Batches by key, flushes after intervalMs (default 5000ms).
// Multiple writes within the interval keep the latest value; timer does NOT reset.

timing.jitter(value: number, range: number): number
// Adds crypto-random offset in [-range, +range] to value.

timing.random(min?: number, max?: number, step?: number): number
// Random in [min, max). With step, rounds to nearest multiple.
// Default: random() = 0-1 like Math.random.

timing.shuffle<T>(array: readonly T[]): T[]
// Fisher-Yates shuffle. Returns NEW array. Uses Math.random (not cryptographic).

timing.debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T & { cancel(): void }
// Delays execution until delayMs after the last call. Returns debounced fn with cancel().

timing.throttle<T extends (...args: any[]) => void>(fn: T, intervalMs: number): T & { cancel(): void }
// Executes fn at most once per intervalMs. Trailing call is preserved.
```

### Examples

```ts
import { timing } from "@valentinkolb/stdlib";

await timing.sleep(500);

// Prevent spinner flicker
const data = await timing.withMinLoadTime(() => fetchData(), 500);

// Debounced auto-save
const save = timing.buffer(async (key, data) => {
  await api.save(key, data);
}, 2000);
save("doc-1", { title: "Draft" });
save("doc-1", { title: "Final" }); // replaces previous, flushes after 2s

// Retry with jitter
await timing.sleep(1000 + timing.jitter(0, 200)); // ~800-1200ms

timing.random(1, 10);       // float 1-10
timing.random(1, 10, 1);    // integer 1-10
timing.random(0, 100, 5);   // 0, 5, 10, ... 100

timing.shuffle([1, 2, 3, 4, 5]); // e.g. [3, 1, 5, 2, 4]

// Debounce: delays until input stops
const search = timing.debounce((q: string) => fetchResults(q), 300);
search("hel"); search("hello");  // only "hello" fires after 300ms
search.cancel();                  // cancel pending call

// Throttle: at most once per interval
const onScroll = timing.throttle(() => updatePosition(), 100);
window.addEventListener("scroll", onScroll);
onScroll.cancel();                // cancel pending trailing call
```

**Gotchas:**
- `buffer` does NOT reset the timer on subsequent writes. First write starts the clock, latest value is flushed.
- `buffer` on flush error: logs to console, data is preserved (not deleted).
- `shuffle` uses `Math.random`. For cryptographic shuffle, use `crypto.common` internals (`secureShuffle` is internal).
- `jitter` uses `crypto.getRandomValues` (cryptographically secure).
- `debounce` resets the timer on each call. Only the last call's arguments are used.
- `throttle` preserves the trailing call -- if called during the cooldown, the last call fires after the interval.

---

## streaming

Async generators for consuming `ReadableStream` data (e.g. from `fetch()` response bodies).

### API

```ts
streaming.parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data: string; id?: string }>
// Yields parsed Server-Sent Event objects. Handles multi-line data fields and reconnection IDs.

streaming.parseNDJSON<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T>
// Yields parsed JSON objects from a newline-delimited JSON stream. Skips blank lines.
```

### Examples

```ts
import { streaming } from "@valentinkolb/stdlib";

// Server-Sent Events
const res = await fetch("/api/events");
for await (const event of streaming.parseSSE(res.body!)) {
  console.log(event.event, event.data);  // e.g. "message", '{"text":"hello"}'
}

// NDJSON (e.g. structured log stream)
const res2 = await fetch("/api/logs");
for await (const entry of streaming.parseNDJSON<{ level: string; msg: string }>(res2.body!)) {
  console.log(`[${entry.level}] ${entry.msg}`);
}
```

**Gotchas:**
- Both generators fully consume the stream. Do not read the same stream twice.
- `parseSSE` follows the SSE spec: empty `event` defaults to `"message"`, multi-line `data:` fields are joined with `\n`.
- `parseNDJSON` calls `JSON.parse` per line -- invalid JSON lines throw.

---

## text

String manipulation utilities.

### API

```ts
text.slugify(content: string): string     // "Hello World!" => "hello-world"
text.humanize(content: string): string    // "hello_world-foo" => "Hello world foo"
text.titleify(content: string): string    // "hello_world-foo" => "Hello World Foo"
text.pprintBytes(bytes: number): string   // 1536 => "1.50 KB"

text.truncate(content: string, limit: number, mode?: "end" | "start" | "middle"): string
// Truncates to limit chars with "..." marker. Default mode: "end".

text.summarize(content: string, limit: number, mode?: "end" | "start" | "middle"): string
// Like truncate but breaks at word boundaries.

text.camelCase(content: string): string   // "hello-world" => "helloWorld"
text.snakeCase(content: string): string   // "helloWorld" => "hello_world"
text.kebabCase(content: string): string   // "HelloWorld" => "hello-world"
text.pascalCase(content: string): string  // "hello_world" => "HelloWorld"
```

### Examples

```ts
import { text } from "@valentinkolb/stdlib";

text.slugify("Uber uns!");         // "uber-uns"
text.slugify("  ---  ");           // ""
text.humanize("user_first_name");  // "User first name"
text.titleify("hello-world");      // "Hello World"
text.pprintBytes(0);               // "0 bytes"
text.pprintBytes(1536);            // "1.50 KB"
text.pprintBytes(1073741824);      // "1.00 GB"
text.pprintBytes(NaN);             // "0 bytes"

text.truncate("Hello World", 8);           // "Hello..."
text.truncate("Hello World", 8, "start");  // "...World"
text.truncate("Hello World", 8, "middle"); // "He...ld"
text.summarize("The quick brown fox jumps over the lazy dog", 20); // "The quick brown..."

text.camelCase("hello-world");     // "helloWorld"
text.snakeCase("helloWorld");      // "hello_world"
text.kebabCase("HelloWorld");      // "hello-world"
text.pascalCase("hello_world");    // "HelloWorld"
```

**Gotchas:**
- `slugify` does NFKD normalization and strips diacritics. "u" with combining mark becomes "u".
- `pprintBytes` uses binary units (1 KB = 1024 bytes).
- `pprintBytes` guards against Infinity, NaN, and non-positive values.
- `truncate` counts the `"..."` marker towards the limit. If `limit` < 4, returns the raw truncation without a marker.
- `summarize` breaks at the last space before the limit, so the result may be shorter than `limit`.
- Case conversion functions split on hyphens, underscores, spaces, and camelCase boundaries.

---

## cache

In-memory TTL cache with lazy loading and cleanup hooks.

### Types

```ts
type CacheOptions<T> = {
  ttl?: number;                              // default 30 minutes (30 * 60_000)
  onMiss?: (key: string) => T | null | Promise<T | null>;
  beforePurge?: (key: string, value: T) => void | Promise<void>;
};

type Cache<T> = {
  get(key: string): Promise<T | null>;
  set(key: string, valueOrUpdater: T | ((current: T | null) => T | Promise<T>)): Promise<T>;
  delete(key: string): void;
  has(key: string): boolean;
  clear(): void;
  size(): number;
};
```

### API

```ts
cache.create<T>(options?: CacheOptions<T>): Cache<T>
// Also exported as: createCache<T>(options?)
```

### Examples

```ts
import { cache, createCache } from "@valentinkolb/stdlib";

// Simple TTL cache
const tokenCache = cache.create<string>({ ttl: 60_000 });
await tokenCache.set("access", "eyJ...");
const token = await tokenCache.get("access"); // string | null

// Auto-fetching cache (lazy loading)
const userCache = createCache<User>({
  ttl: 5 * 60_000,
  onMiss: async (key) => {
    const res = await fetch(`/api/users/${key}`);
    return res.ok ? res.json() : null;
  },
  beforePurge: (key) => console.log(`evicted: ${key}`),
});
const user = await userCache.get("user-123"); // fetches on first call, cached after

// Updater function for atomic read-modify-write
await tokenCache.set("count", 1);
await tokenCache.set("count", (prev) => (prev ?? 0) + 1);

// Check and size
tokenCache.has("access"); // true/false (sync)
tokenCache.size();        // number of non-expired entries
tokenCache.clear();       // removes all entries + cancels timers
```

**Gotchas:**
- `get` returns `Promise<T | null>` even without `onMiss` (async for consistency).
- `delete` and `clear` do NOT trigger `beforePurge`.
- `size()` iterates all entries to exclude expired ones (O(n)).
- Concurrent `get` calls triggering `onMiss` for the same key both execute. No built-in deduplication.

---

## result

Result type for service-layer error handling. Eliminates try/catch boilerplate.

### Types

```ts
type ServiceErrorCode = "BAD_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

type ServiceError<C extends string = string> = {
  code: C;
  message: string;
  status: 400 | 401 | 403 | 404 | 409 | 500;
};

type Result<T = void, E extends ServiceError = ServiceError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

type PageParams = { page?: number; perPage?: number };

type Paginated<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  hasNext: boolean;
};
```

### API

```ts
// Constructors
ok(): Result<void, never>
ok<T>(data: T): Result<T, never>
okMany<T>(items: T[], info: { page: number; perPage: number; total: number }): Result<Paginated<T>, never>
fail<E extends ServiceError>(error: E): Result<never, E>

// Error factories
err.badInput(why: string): ServiceError         // 400
err.unauthenticated(why?: string): ServiceError // 401
err.forbidden(why?: string): ServiceError       // 403
err.notFound(what: string): ServiceError        // 404, message: "<what> not found"
err.conflict(what: string): ServiceError        // 409, message: "<what> already exists"
err.internal(why?: string): ServiceError        // 500

// Helpers
paginate(params?: PageParams): { page: number; perPage: number; offset: number }
unwrap<T>(result: Result<T>): T                  // throws on failure
isServiceError(value: unknown): value is ServiceError
tryCatch<T>(fn: () => Promise<T>, onError?: (error: unknown) => ServiceError): Promise<Result<T>>
```

### Examples

```ts
import { ok, fail, err, okMany, paginate, unwrap, tryCatch } from "@valentinkolb/stdlib";

// Service function pattern
async function getUser(id: string): Promise<Result<User>> {
  const user = await db.findUser(id);
  if (!user) return fail(err.notFound("User"));
  return ok(user);
}

// Consuming results
const result = await getUser("123");
if (!result.ok) {
  console.error(result.error.code, result.error.message); // "NOT_FOUND", "User not found"
  return;
}
console.log(result.data); // User

// unwrap -- throws if not ok
const user = unwrap(await getUser("123"));

// Paginated results
const { page, perPage, offset } = paginate({ page: 2, perPage: 10 });
const users = await db.query({ limit: perPage, offset });
return okMany(users, { page, perPage, total: 100 });
// { ok: true, data: { items: [...], page: 2, perPage: 10, total: 100, hasNext: true } }

// tryCatch -- wraps async function, never throws
const result2 = await tryCatch(() => riskyOperation());
// On error: { ok: false, error: { code: "INTERNAL", message: "...", status: 500 } }
```

**Gotchas:**
- `ok()` with no args produces `{ ok: true, data: undefined }` (`Result<void>`).
- `unwrap` throws an `Error` with `code` and `status` properties `Object.assign`ed onto it.
- `paginate` clamps both `page` and `perPage` to minimum 1. Default: page=1, perPage=20.
- `tryCatch` checks `isServiceError` first -- if the thrown value is already a `ServiceError`, it wraps it directly.
- `err.notFound("User")` produces message `"User not found"`. `err.conflict("Email")` produces `"Email already exists"`.

---

## qr

QR code payload generation and SVG rendering. Uses `lean-qr`.

### API

```ts
qr.wifi(opts: { ssid: string; password?: string; encryption?: "WPA" | "WEP" | "nopass"; hidden?: boolean }): string
qr.email(opts: { to: string; subject?: string; body?: string }): string
qr.tel(opts: { number: string }): string
qr.vcard(opts: {
  firstName: string; lastName?: string; organization?: string; title?: string;
  phone?: string; email?: string; website?: string;
  street?: string; city?: string; zip?: string; country?: string;
}): string
qr.event(opts: {
  title: string; location?: string;
  start?: string; end?: string;    // datetime-local format: "2025-06-15T14:30"
  description?: string;
}): string
qr.toSvg(data: string, opts?: { on?: string; off?: string; correctionLevel?: "L" | "M" | "Q" | "H" }): string
```

### Examples

```ts
import { qr } from "@valentinkolb/stdlib";

// WiFi QR code
const wifiData = qr.wifi({ ssid: "Office", password: "secret", encryption: "WPA" });
// "WIFI:T:WPA;S:Office;P:secret;;"

// Render as SVG
const svgString = qr.toSvg(wifiData, { correctionLevel: "M", on: "#000", off: "#fff" });

// Email
qr.email({ to: "a@b.c", subject: "Hello" }); // "mailto:a@b.c?subject=Hello"

// Phone
qr.tel({ number: "+49123456" }); // "tel:+49123456"

// vCard contact
const vcardData = qr.vcard({
  firstName: "John", lastName: "Doe",
  organization: "Acme", phone: "+49123456", email: "john@acme.com"
});

// Calendar event
const eventData = qr.event({
  title: "Meeting",
  start: "2025-06-15T14:30", end: "2025-06-15T15:30",
  location: "Room 42"
});
const eventSvg = qr.toSvg(eventData);
```

**Gotchas:**
- `toSvg` defaults: `on="#000000"`, `off="#ffffff"`, `correctionLevel="M"`.
- WiFi special characters (`;,:"\`) are auto-escaped in SSID and password.
- vCard uses CRLF line endings per RFC 6350.
- Event start/end use `datetime-local` format (`"2025-06-15T14:30"`), not ISO 8601 with timezone.

---

## svg

Deterministic SVG avatar generation and WebP parsing.

### API

```ts
svg.generateAvatar(id: string, text: string): Uint8Array
// Returns UTF-8 encoded SVG (128x128). Color is deterministic from id.
// Text is uppercased, truncated to 2 chars. Empty text shows "?".

svg.parseWebpDataUrl(dataUrl: string): Uint8Array | null
// Extracts raw bytes from "data:image/webp;base64,...". Returns null if format is wrong.
```

### Examples

```ts
import { svg } from "@valentinkolb/stdlib";

const avatarBytes = svg.generateAvatar("user-123", "JD");
// Uint8Array containing SVG with colored background and "JD" text

// Use as data URL
const blob = new Blob([avatarBytes], { type: "image/svg+xml" });
const url = URL.createObjectURL(blob);

// Parse WebP
const webpBytes = svg.parseWebpDataUrl("data:image/webp;base64,UklGR...");
// Uint8Array | null
```

**Gotchas:**
- Avatar color palette has 10 colors. Same `id` always yields same color.
- `parseWebpDataUrl` only accepts `image/webp` MIME type. Other formats return `null`.
- The generated SVG uses JetBrains Mono font.

---

## searchParams

URL search parameter serialization, deserialization, and change listening.

### API

```ts
searchParams.deserialize<T>(params?: URLSearchParams): Partial<T>
// "true"/"false" => boolean, numeric strings => number (only if round-trip safe),
// complex values => JSON.parse, fallback => raw string.
// Without params arg, reads from globalThis.location.search.

searchParams.serialize<T>(newParams: Partial<T>, params?: URLSearchParams): string
// Returns URL search string (no leading "?").
// Removes params that are undefined, null, false, or "".
// Primitives stringified directly, objects/arrays JSON-encoded.

searchParams.onChange<T>(callback: (params: Partial<T>) => void): () => void
// Listens for popstate events. Returns cleanup function.
// No-op in non-browser environments.
```

### Examples

```ts
import { searchParams } from "@valentinkolb/stdlib";

// Deserialize (browser: reads from URL)
// URL: ?page=2&active=true&name=John
const params = searchParams.deserialize<{ page: number; active: boolean; name: string }>();
// { page: 2, active: true, name: "John" }

// Deserialize from explicit params
const p = searchParams.deserialize(new URLSearchParams("page=2&tags=[\"a\",\"b\"]"));
// { page: 2, tags: ["a", "b"] }

// Serialize
searchParams.serialize({ page: 2, active: true, q: "" });
// "page=2&active=true" (q removed because empty string)

// Listen for changes
const cleanup = searchParams.onChange<{ page: number }>((params) => {
  console.log("Page:", params.page);
});
// cleanup() to stop listening
```

**Gotchas:**
- Zero-padded strings like `"007"` are kept as strings (round-trip check: `String(Number("007"))` is `"7"`, not `"007"`).
- `"null"` is kept as the literal string `"null"`, not coerced.
- `false`, `null`, `undefined`, and `""` all cause the param to be deleted during serialization.
- `onChange` only fires on `popstate` (back/forward navigation), not on `pushState`/`replaceState`.

---

## fileIcons

File type categorization and Tabler Icons CSS class lookup.

### Types

```ts
type FileInfoLike = { name: string; type: "file" | "directory"; mimeType?: string };
type FileCategory = "image" | "pdf" | "video" | "audio" | "text" | "code" | "document" | "archive" | "other";
```

### API

```ts
fileIcons.getFileCategory(item: FileInfoLike): FileCategory
// Checks MIME type first, then file extension. Falls back to "other".

fileIcons.getFileIcon(item: FileInfoLike): string
// Returns Tabler Icons class + Tailwind color, e.g. "ti-brand-typescript text-blue-500".
// Priority: folder name > exact filename > extension > MIME prefix > default.
```

### Examples

```ts
import { fileIcons } from "@valentinkolb/stdlib";

fileIcons.getFileCategory({ name: "photo.png", type: "file" });           // "image"
fileIcons.getFileCategory({ name: "app.ts", type: "file" });              // "code"
fileIcons.getFileCategory({ name: "data.csv", type: "file" });            // "document"

fileIcons.getFileIcon({ name: "index.ts", type: "file" });                // "ti-brand-typescript text-blue-500"
fileIcons.getFileIcon({ name: "photo.jpg", type: "file" });               // "ti-photo text-emerald-500"
fileIcons.getFileIcon({ name: "package.json", type: "file" });            // "ti-brand-npm text-red-500"
fileIcons.getFileIcon({ name: "documents", type: "directory" });           // "ti-briefcase text-blue-500"
fileIcons.getFileIcon({ name: "src", type: "directory" });                 // "ti-folder text-amber-500"
fileIcons.getFileIcon({ name: "unknown.xyz", type: "file" });             // "ti-file text-zinc-400"
```

**Gotchas:**
- Icons are Tabler Icons class names (`ti-*`) with Tailwind CSS color utilities.
- Supports special filenames: `dockerfile`, `package.json`, `tsconfig.json`, `.env`, etc.
- Supports GNOME standard folders: `documents`, `pictures`, `music`, `downloads`, etc. (including German: `dokumente`, `bilder`).

---

## gradients

CSS gradient presets for UI name styling.

### Types

```ts
type GradientPreset = {
  id: string;
  label: string;
  style: string;    // CSS inline style for background-clip text gradient
  preview: string;  // CSS background-image for swatch preview
};
```

### API

```ts
gradients.presets: GradientPreset[]              // alias for gradientPresets
gradients.gradientPresets: GradientPreset[]      // all presets
gradients.defaultGradient: GradientPreset        // "Berry" (purple-pink)
gradients.getById(id: string): GradientPreset    // alias for getGradientById
gradients.getGradientById(id: string): GradientPreset  // returns default if not found
```

Available presets: `"default"` (Berry), `"mono"`, `"ocean"`, `"sunset"`, `"forest"`, `"pride"`, `"gold"`.

### Examples

```ts
import { gradients } from "@valentinkolb/stdlib";

const preset = gradients.getById("ocean");
// Apply as inline style:
// <span style={preset.style}>User Name</span>

gradients.presets.map(p => p.label); // ["Berry","Mono","Ocean","Sunset","Forest","Pride","Gold"]
```

**Gotchas:**
- `"mono"` preset has an empty `style` string (plain text, no gradient).
- `getById` returns the default ("Berry") when the ID is not found, never null/undefined.
