# Core Modules

```ts
import { encoding, crypto, password, dates, fileIcons, gradients, result, svg, timing, streaming, text, fuzzy, charts, searchParams, cache } from "@valentinkolb/stdlib";
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
// { entropy: 41.36, score: 2, label: "fair", crackTime: "5 minutes", feedback: ["Use more random words"] }

password.strength("password123");
// { entropy: 12.7, score: 1, label: "weak", crackTime: "seconds", feedback: ["Add more characters", ...] }
```

The memorable generator uses the EFF Short Wordlist 1 (1,296 words, 10.34 bits/word). Four random words are easy to type; use six or more words when offline cracking resistance matters.

## dates

Date formatting, relative time, and calendar helpers with optional IANA timezone support.

Most functions accept a final context object:

```ts
type DateContext = {
  timeZone?: string;      // e.g. "Europe/Berlin", "America/New_York"
  locale?: string;        // e.g. "en", "de", "fr"
  weekStartsOn?: 0 | 1;   // Sunday or Monday, default Monday
};
```

Existing calls keep their current behavior: absolute formatters default to UTC, calendar helpers default to the runtime's local timezone. Pass `timeZone` when the user's calendar day matters.

```ts
import { dates } from "@valentinkolb/stdlib";

dates.formatDate("2025-03-05T13:53:00Z");         // "05 Mar 2025"
dates.formatDateTime("2025-03-05T13:53:00Z");      // "05 Mar 2025, 13:53"
dates.formatDateTime("2025-03-05T23:30:00Z", { timeZone: "Europe/Berlin" });
// "06 Mar 2025, 00:30"
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
const berlinRange = dates.getDateRange("week", new Date(), { timeZone: "Europe/Berlin" });

dates.isToday(new Date());                  // true
dates.isSameDay(a, b, { timeZone: "America/New_York" });
dates.addMonths(new Date(), -1, { timeZone: "Europe/Berlin" });
dates.formatMonthYear(new Date());           // "March 2025"
dates.formatMonthYear(new Date(), "de");     // "März 2025"
dates.formatDateKey(new Date(), { timeZone: "Asia/Tokyo" }); // "2025-03-05"
dates.weekdays("fr");                        // ["lun.", "mar.", ...]

// Filter items that fall on a date
const items = dates.getDayItems(allItems, date, { timeZone: "Europe/Berlin" });

// Build calendar URLs
dates.buildCalendarUrl("/app", { view: "week", date: new Date() }, { timeZone: "Europe/Berlin" });
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

## fuzzy

Subsequence fuzzy match for UI search and Levenshtein distance for "did you
mean?" lookups. Case-insensitive by default; pass `caseSensitive: true` to
opt into strict matching.

```ts
import { fuzzy } from "@valentinkolb/stdlib";

// ─── Subsequence fuzzy match (UI search, command palette) ───────────────

fuzzy.match("udh", "userDashboard");
// { score: 78, ranges: [[0,1], [4,5], [7,8]] }

fuzzy.match("xyz", "userDashboard");                        // null
fuzzy.match("UDH", "userDashboard", { caseSensitive: true }); // null

// Filter + rank a list, with optional accessor and limit
fuzzy.filter("udh", ["userDashboard", "logout", "userHome"]);
// [{ item, target, score, ranges }, ...] sorted by score desc

fuzzy.filter("ab", users, { key: u => u.name, limit: 10 });

// Pre-split target into matched/non-matched runs for JSX <mark> highlighting
fuzzy.segments("userDashboard", [[0,1], [4,5], [7,8]]);
// [{ text: "u", match: true }, { text: "ser", match: false },
//  { text: "D", match: true }, { text: "as",  match: false },
//  { text: "h", match: true }, { text: "board", match: false }]

// ─── Levenshtein (typo-tolerant lookups) ────────────────────────────────

fuzzy.distance("color", "colour");                          // 1
fuzzy.distance("kitten", "sitting");                        // 3

fuzzy.closest("hellp", ["hello", "help", "world"]);
// { value: "hello", distance: 1, similarity: 0.8 }

fuzzy.closest("zzz", ["alpha", "beta"], { maxDistance: 2 }); // null
```

The `match` algorithm uses a fzf-inspired scoring heuristic that rewards
prefix matches, word boundaries (kebab/snake/space/dot/camelCase), contiguous
runs, and case agreement. Score values are raw and only comparable within a
single query — use them for sorting, not for cross-query thresholds.

## charts

Eight SVG chart generators covering the basic shapes plus the features most
useful for dashboards and scientific publication: `scatter`, `line`, `bar`,
`pie`, `donut`, `sparkline`, `histogram`, `boxplot`. Returns SVG strings —
inject into the DOM, write to disk, or send over the wire. Pure native, no
peer dependencies.

```ts
import { charts } from "@valentinkolb/stdlib";

charts.scatter({ series: [{ data: [{x:1,y:2,size:10}] }], sizeRange: [3,14] });
charts.line({ series: [{ data: [...] }, { data: [...] }] });
charts.bar({ data: [{label:"Q1",value:120}], colorByBar: true });
charts.pie({ data: [{label:"A",value:30}], showLabels: true });
charts.donut({ data: [...] });
charts.sparkline({ data: [3,7,5,9,12,10,14], showLast: true });
charts.histogram({ data: observations, bins: 30 });
charts.boxplot({ groups: [{label:"A", values:[1,2,3,4,5]}] });
```

### Headers, axes, references, legend (every chart type)

```ts
charts.bar({
  title: "Quarterly Revenue", subtitle: "in thousand EUR",
  data: quarterlyRevenue,
  yAxis: { label: "Revenue", format: v => `€${v}k`, scale: "linear", minorTicks: true },
  references: [{ value: 200, label: "Target" }],
  showValues: true,                              // value labels on bars
  colorByBar: true, legend: true,
});
```

### Lines: smooth, area, step, error band, line styles

```ts
charts.line({
  series: [
    { label: "Revenue", data: revenue, lineStyle: "solid" },
    { label: "Costs",   data: costs,   lineStyle: "dashed" },
  ],
  smooth: true,        // Catmull-Rom by default; pass false for straight
  area: true,          // translucent fill below each line
  step: "before",      // step plot mode (overrides smooth)
  errorBand: true,     // CI band between errYHigh/errYLow per point
  autoVariant: true,   // cycle line styles when not explicit
  legend: true,
  references: [{ value: 50, label: "baseline" }],
});
```

### Scatter: bubbles, markers, error bars, trend line

```ts
charts.scatter({
  series: [
    { label: "Group A", marker: "square",   data: [{ x: 1, y: 2, size: 30, errY: 0.5 }] },
    { label: "Group B", marker: "triangle", data: [...] },
  ],
  sizeRange: [3, 16],   // bubble radii (when Point.size present)
  autoVariant: true,    // cycle marker shapes
  trendline: true,      // linear-regression overlay
  legend: true,
});
```

`Point` supports symmetric `errY`/`errX` or asymmetric `errYHigh`/`errYLow`/
`errXHigh`/`errXLow` for asymmetric uncertainty.

### Logarithmic axes

```ts
charts.scatter({
  series: [{ data: powerLawData }],
  xAxis: { scale: "log" },
  yAxis: { scale: "log", minorTicks: true },
});
```

Non-positive values are filtered automatically under log scale.

### Histogram & box plot (statistical)

```ts
charts.histogram({
  data: observations,                // raw numeric list
  bins: 30,                           // number, edge array, or undefined (Sturges')
  yAxis: { label: "Count" },
});

charts.boxplot({
  groups: [
    { label: "Class A", values: scoresA },
    { label: "Class B", values: scoresB },
  ],
  showOutliers: true,                 // default
  colorByBox: true,
});
```

### Common options (`ChartOptions`)

| option | default | notes |
|---|---|---|
| `width` | 400 (80 sparkline) | viewBox width |
| `height` | 240 (20 sparkline) | viewBox height |
| `padding` | `{16, 16, 32, 40}` | number applies to all sides |
| `className` | — | appended to root `<svg>`'s class |
| `title` / `subtitle` | — | centered header above the plot |

`AxisOptions` accepts `{ ticks?, format?, label?, scale?: "linear" | "log",
minorTicks? }`.

### Styling

Charts ship with embedded default CSS. Override via:

1. **Class selectors** — your CSS has higher specificity than the embedded `<style>`:
   ```css
   .stdlib-chart-line { stroke-width: 3; }
   .stdlib-chart-bar  { rx: 4; }
   ```
2. **CSS custom properties** for the 8 default series colors:
   ```css
   .my-chart { --stdlib-chart-c1: #f43f5e; --stdlib-chart-c2: #f97316; }
   ```
3. **`currentColor`** is used for axes, tick labels, error bars, references,
   and sparklines — set the parent's `color` for theming (dark mode "just works").
4. The chart's font is **inherited from the surrounding HTML** — the app's
   font automatically applies.

Pass `className` to scope per-instance styles.

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
