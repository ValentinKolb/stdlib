# Core Modules

```ts
import { encoding, crypto, password, dates, fileIcons, gradients, result, svg, timing, streaming, text, searchParams, cache } from "@valentinkolb/stdlib";
import { qr } from "@valentinkolb/stdlib/qr"; // separate subpath -- requires the optional `lean-qr` peer
```

## encoding

Base64, hex, and Base32 encode/decode. Uses native `Buffer`/`Uint8Array.toHex` when available.

```ts
import { encoding } from "@valentinkolb/stdlib";

const bytes = new Uint8Array([0xca, 0xfe]);
encoding.toHex(bytes);    // "cafe"
encoding.toBase64(bytes);  // "yv4="
encoding.toBase32(bytes);  // "ZL7A===="

// Round-trip
encoding.fromHex("cafe");
encoding.fromBase64("yv4=");
encoding.fromBase32("ZL7A====");

// Base62 (URL-safe, no special chars)
encoding.toBase62(123456789);        // "8M0kX"
encoding.toBase62(42, 6);            // "000010" (min 6 chars)
encoding.fromBase62("8M0kX");        // 123456789
```

## crypto

SHA-256 hashing, key generation, symmetric/asymmetric encryption, TOTP, and digital signatures. All built on the Web Crypto API.

### Common utilities

```ts
import { crypto } from "@valentinkolb/stdlib";

await crypto.common.hash("hello");          // SHA-256 hex string
crypto.common.fnv1aHash("hello");           // fast non-crypto hash
crypto.common.uuid();                       // crypto.randomUUID()
crypto.common.readableId();                 // "a3X-B7nm-4Kp-qR9v"
crypto.common.readableId(5, 5);             // "3nK4p-Xm9Bq"
crypto.common.generateKey();                // 256-bit hex key
```

### Symmetric encryption (AES-256-GCM)

```ts
// Password-based (PBKDF2, 100k iterations)
const enc = await crypto.symmetric.encrypt({ payload: "secret", key: "password" });
const dec = await crypto.symmetric.decrypt({ payload: enc, key: "password" });

// High-entropy key (HKDF, fast)
const key = crypto.common.generateKey();
const enc2 = await crypto.symmetric.encrypt({ payload: "data", key, stretched: false });
```

### Asymmetric encryption (ECDH P-256 + AES-256-GCM)

```ts
const { privateKey, publicKey } = await crypto.asymmetric.generate();
const encrypted = await crypto.asymmetric.encrypt({ payload: "hello", publicKey });
const decrypted = await crypto.asymmetric.decrypt({ payload: encrypted, privateKey });
```

### Digital signatures (ECDSA P-256)

```ts
const { nonce, timestamp, signature } = await crypto.asymmetric.sign({
  privateKey,
  message: "important data",
});
const valid = await crypto.asymmetric.verify({
  publicKey,
  signature,
  nonce,
  timestamp,
  message: "important data",
});
```

### TOTP (RFC 6238)

```ts
const { uri, secret } = await crypto.totp.create({ label: "user@example.com", issuer: "MyApp" });
// Show `uri` as QR code, store `secret` encrypted
const ok = await crypto.totp.verify({ token: "123456", secret });
```

## password

Password generation and strength analysis. Separated from crypto for tree-shaking -- importing crypto won't pull in the 5KB wordlist.

```ts
import { password } from "@valentinkolb/stdlib";

password.random();                                    // "aB3kLm9xQr2Wp5Nj7Ht" (20 chars)
password.random({ length: 32, symbols: true });
password.memorable();                                 // "correct-horse-battery-staple"
password.memorable({ capitalize: true, addNumber: true });
password.pin();                                       // "384729"
password.pin({ length: 4 });                          // "2847"

// Strength analysis
password.strength("correct-horse-battery-staple");
// { entropy: 41.36, score: 3, label: "strong", crackTime: "centuries", feedback: [] }

password.strength("password123");
// { entropy: 12.7, score: 1, label: "weak", crackTime: "seconds", feedback: ["Add more characters", ...] }
```

The memorable generator uses the EFF Short Wordlist 1 (1,296 words, 10.34 bits/word).

## dates

UTC date formatting and relative time strings. Zero dependencies.

```ts
import { dates } from "@valentinkolb/stdlib";

dates.formatDate("2025-03-05T13:53:00Z");         // "05 Mar 2025"
dates.formatDateTime("2025-03-05T13:53:00Z");      // "05 Mar 2025, 13:53"
dates.formatDateTimeRelative(new Date());           // "just now"
dates.formatDateRelative(new Date());               // "14:30"
dates.formatTimeSpan("2025-03-10T00:00:00Z");       // "in 3 days"
dates.formatDuration("2025-03-01", "2025-03-03");   // "2 days"
```

## dates (calendar views)

Calendar grids, date checks, navigation, and locale-aware formatting are all part of the `dates` module.

```ts
import { dates } from "@valentinkolb/stdlib";

const weeks = dates.getMonthGrid(2025, 0);  // January 2025, 2D array of Dates
const days = dates.getWeekDays(new Date());  // Mon-Sun array
const range = dates.getDateRange("month", new Date());

dates.isToday(new Date());                  // true
dates.isSameDay(a, b);
dates.addMonths(new Date(), -1);
dates.formatMonthYear(new Date());           // "March 2025"
dates.formatMonthYear(new Date(), "de");     // "März 2025"
dates.formatDateKey(new Date());             // "2025-03-05"
dates.weekdays("fr");                        // ["lun.", "mar.", ...]

// Filter items that fall on a date
const items = dates.getDayItems(allItems, date);

// Build calendar URLs
dates.buildCalendarUrl("/app", { view: "week", date: new Date() });
```

## fileIcons

Maps files to Tabler icon CSS classes and broad categories by extension and MIME type.

```ts
import { fileIcons } from "@valentinkolb/stdlib";

fileIcons.getFileIcon({ name: "app.ts", type: "file" });
// "ti-brand-typescript text-blue-500"

fileIcons.getFileIcon({ name: "photos", type: "directory" });
// "ti-photo text-emerald-500"

fileIcons.getFileCategory({ name: "photo.jpg", type: "file" });
// "image"
```

## gradients

Named CSS gradient presets for UI theming (Berry, Ocean, Sunset, Forest, Pride, Gold, Mono).

```ts
import { gradients } from "@valentinkolb/stdlib";

gradients.presets;                    // GradientPreset[]
gradients.getById("ocean");          // { id, label, style, preview }
gradients.defaultGradient;           // Berry preset
```

Apply with inline styles: `<span style={preset.style}>Username</span>`.

## result

Typed `Result<T, E>` for service-layer error handling with pagination support.

```ts
import { ok, fail, err, unwrap, tryCatch, paginate, okMany } from "@valentinkolb/stdlib";

// Constructors
ok({ id: 1 });                       // { ok: true, data: { id: 1 } }
fail(err.notFound("User"));          // { ok: false, error: { code: "NOT_FOUND", ... } }

// Error factories
err.badInput("Email required");      // 400
err.unauthenticated();               // 401
err.forbidden();                     // 403
err.notFound("User");                // 404
err.conflict("Email");               // 409
err.internal();                      // 500

// Unwrap or throw
const data = unwrap(result);

// Wrap async functions
const result = await tryCatch(() => fetchUser(id));

// Pagination
const { page, perPage, offset } = paginate({ page: 2, perPage: 10 });
okMany(items, { page, perPage, total: 100 });
```

## qr

QR code payload generators and SVG rendering. Lives behind the `/qr` subpath
so the optional `lean-qr` peer dependency is only required for consumers that
actually use QR features.

```ts
import { qr } from "@valentinkolb/stdlib/qr";

// Generate payloads
qr.wifi({ ssid: "Office", password: "secret" });
qr.email({ to: "a@b.c", subject: "Hello" });
qr.tel({ number: "+49123456" });
qr.vcard({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" });
qr.event({ title: "Meeting", start: "2025-06-15T14:30", end: "2025-06-15T15:30" });

// Render to SVG
const svgString = qr.toSvg(qr.wifi({ ssid: "Guest" }), {
  correctionLevel: "M",
  on: "#000",
  off: "#fff",
});
```

## svg

Deterministic SVG avatar generation and WebP data URL parsing.

```ts
import { svg } from "@valentinkolb/stdlib";

const avatarBytes = svg.generateAvatar("user-123", "JD");
// Uint8Array containing a 128x128 SVG with color derived from the ID

const imageData = svg.parseWebpDataUrl("data:image/webp;base64,...");
// Uint8Array | null
```

## timing

Async timing utilities: sleep, jitter, write-coalescing, min-load-time, shuffle, random.

```ts
import { timing } from "@valentinkolb/stdlib";

await timing.sleep(500);
timing.jitter(1000, 200);              // 800-1200 (crypto-random)
timing.random(1, 10, 1);               // integer 1-10
timing.shuffle([1, 2, 3, 4, 5]);       // Fisher-Yates shuffle

// Prevent UI flicker on fast requests
const data = await timing.withMinLoadTime(() => fetch("/api"), 300);

// Batch writes per key
const save = timing.buffer(
  async (key, data) => await api.save(key, data),
  2000,
);
save("doc-1", { title: "Draft" });
save("doc-1", { title: "Final" });   // replaces previous, flushes after 2s

// Debounce -- delays execution until input stops
const search = timing.debounce((query: string) => {
  fetchResults(query);
}, 300);
search("hel"); search("hello");     // only "hello" fires, after 300ms

// Throttle -- executes at most once per interval
const onScroll = timing.throttle(() => {
  updateScrollPosition();
}, 100);
```

## streaming

Async generators for consuming `ReadableStream` data. Works with `fetch()` response bodies.

```ts
import { streaming } from "@valentinkolb/stdlib";

// Parse Server-Sent Events (SSE)
const res = await fetch("/api/events");
for await (const event of streaming.parseSSE(res.body!)) {
  console.log(event.event, event.data);
}

// Parse newline-delimited JSON (NDJSON)
const res2 = await fetch("/api/logs");
for await (const entry of streaming.parseNDJSON<LogEntry>(res2.body!)) {
  console.log(entry.level, entry.message);
}
```

## text

String transformation and formatting utilities.

```ts
import { text } from "@valentinkolb/stdlib";

text.slugify("Hello World!");     // "hello-world"
text.humanize("hello_world-foo"); // "Hello world foo"
text.titleify("hello_world-foo"); // "Hello World Foo"
text.pprintBytes(1536);                // "1.5 KiB" (IEC default, 1024-base; locale-aware decimal)
text.pprintBytes(1500, "si");          // "1.5 KB"  (SI mode, 1000-base)
text.pprintBytes(0);                   // "0 B"
text.pprintBytesParts(1536);           // { value: "1.5", unit: "KiB" } — for styled UI rendering
text.pprintBytesParts(1500, "si");     // { value: "1.5", unit: "KB"  }

// Truncation and summarization
text.truncate("Hello World", 8);               // "Hello..."
text.truncate("Hello World", 8, "start");      // "...World"
text.summarize("Long paragraph...", 100);       // first 100 chars, word-boundary aware

// Case conversion
text.camelCase("hello-world");    // "helloWorld"
text.snakeCase("helloWorld");     // "hello_world"
text.kebabCase("HelloWorld");     // "hello-world"
text.pascalCase("hello_world");   // "HelloWorld"
```

## searchParams

Typed URL search parameter serialization with smart coercion.

```ts
import { searchParams } from "@valentinkolb/stdlib";

// Deserialize with type coercion (booleans, numbers, JSON)
const params = searchParams.deserialize<{ page: number; active: boolean }>(
  new URLSearchParams("page=2&active=true"),
);
// { page: 2, active: true }

// Serialize (removes null/undefined/false/"")
searchParams.serialize({ page: 2, active: true }); // "page=2&active=true"

// Watch for URL changes (popstate)
const cleanup = searchParams.onChange<{ page: number }>((p) => console.log(p.page));
```

## cache

In-memory TTL cache with lazy loading and cleanup hooks.

```ts
import { createCache } from "@valentinkolb/stdlib";

const cache = createCache<User>({ ttl: 5 * 60_000 });
await cache.set("user:1", { name: "Alice" });
const user = await cache.get("user:1");

// Auto-fetching on miss
const apiCache = createCache<Response>({
  ttl: 30 * 60_000,
  onMiss: (key) => fetch(`/api/${key}`).then((r) => r.json()),
  beforePurge: (key) => console.log(`evicted: ${key}`),
});
const data = await apiCache.get("users"); // fetches on first call

// Updater function
await cache.set("count", (prev) => (prev ?? 0) + 1);

cache.has("user:1"); // true
cache.size();        // 1
cache.clear();
```
