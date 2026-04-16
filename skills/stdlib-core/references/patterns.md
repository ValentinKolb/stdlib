# Common Patterns Across Core Modules

Reusable patterns combining multiple `@valentinkolb/stdlib` modules.

---

## 1. Result + tryCatch Pattern

**When to use:** Wrapping any async operation that might fail (DB queries, HTTP calls, file I/O) so callers never deal with thrown exceptions.

```ts
import { ok, fail, err, tryCatch } from "@valentinkolb/stdlib";

async function getUser(id: string): Promise<Result<User>> {
  return tryCatch(
    async () => {
      const user = await db.findUser(id);
      if (!user) throw err.notFound("User");
      return user;
    },
    (error) => err.internal(`Failed to fetch user: ${error}`),
  );
}

// Caller: no try/catch needed
const result = await getUser("123");
if (!result.ok) {
  console.error(result.error.code, result.error.message);
  return;
}
const user = result.data;
```

`tryCatch` catches everything. If the thrown value is already a `ServiceError` (like `err.notFound`), it wraps it directly via `fail()`. Otherwise, the `onError` mapper converts it. If `onError` is omitted, an `err.internal()` is created from the error message.

---

## 2. Cache + onMiss for API Responses

**When to use:** Any data that is expensive to fetch but acceptable to serve slightly stale (user profiles, config, feature flags).

```ts
import { createCache, tryCatch, err } from "@valentinkolb/stdlib";

const userCache = createCache<User>({
  ttl: 5 * 60_000, // 5 minutes
  onMiss: async (key) => {
    const res = await fetch(`/api/users/${key}`);
    if (!res.ok) return null; // null = don't cache
    return res.json();
  },
  beforePurge: (key) => console.log(`evicted user: ${key}`),
});

// First call fetches, subsequent calls return cached
const user = await userCache.get("user-123");

// Force refresh: delete then get
userCache.delete("user-123");
const fresh = await userCache.get("user-123");
```

Key detail: `onMiss` returning `null` means "don't cache this miss." The next `get` will call `onMiss` again. Concurrent `get` calls for the same key both execute `onMiss` (no built-in deduplication).

---

## 3. Encoding Roundtrips

**When to use:** Converting between binary and string representations for storage, transport, or interop with external systems.

```ts
import { encoding } from "@valentinkolb/stdlib";

const payload = new TextEncoder().encode("hello world");

// Base64 roundtrip (URLs, JSON payloads, email attachments)
const b64 = encoding.toBase64(payload);    // "aGVsbG8gd29ybGQ="
const back = encoding.fromBase64(b64);     // Uint8Array

// Hex roundtrip (hashes, keys, debugging)
const hex = encoding.toHex(payload);       // "68656c6c6f20776f726c64"
const back2 = encoding.fromHex(hex);       // Uint8Array

// Base32 roundtrip (TOTP secrets, case-insensitive contexts)
const b32 = encoding.toBase32(payload);    // "NBSWY3DPEB3W64TMMQ======"
const back3 = encoding.fromBase32(b32);    // Uint8Array

// Cross-format: Base64 -> raw bytes -> Hex
const hexFromB64 = encoding.toHex(encoding.fromBase64(b64));
```

Note: `fromHex` throws on odd-length strings. `fromBase32` throws on characters outside A-Z, 2-7. All functions work in both Node.js/Bun and browsers.

---

## 4. Date Formatting Decision Tree

**When to use:** Choosing the right `dates.*` function for your display context.

```
Need exact date + time?
  Yes -> dates.formatDateTime()         // "05 Mar 2025, 13:53"
  No  -> Need relative wording?
           Yes -> Showing in a feed/chat?
                    Yes -> dates.formatDateTimeRelative()  // "just now", "4 mins ago"
                    No  -> Showing in a sidebar/list?
                             Yes -> dates.formatDateRelative()  // "14:30" (today), "Yesterday"
                             No  -> dates.formatTimeSpan()      // "in 3 days", "2 hours ago"
           No  -> Need duration between two dates?
                    Yes -> dates.formatDuration()  // "2 hours 15 minutes"
                    No  -> dates.formatDate()      // "05 Mar 2025"
```

```ts
import { dates } from "@valentinkolb/stdlib";

// Feed message timestamps
dates.formatDateTimeRelative(msg.createdAt); // "just now" / "4 mins ago" / "Yesterday"

// Sidebar last-seen
dates.formatDateRelative(user.lastSeen);     // "14:30" / "Mon" / "05 Mar 2025"

// Countdown/ETA
dates.formatTimeSpan(task.deadline);         // "in 3 days" (uses Intl.RelativeTimeFormat)

// Event duration
dates.formatDuration(event.start, event.end); // "1 day 3 hours"
```

All functions accept `string | Date`, use UTC methods, and are timezone-independent.

---

## 5. Calendar Integration

**When to use:** Building a calendar UI with month/week views, item filtering, and navigation.

```ts
import { calendar } from "@valentinkolb/stdlib";

// 1. Generate the grid for the current month
const now = new Date();
const weeks = calendar.getMonthGrid(now.getFullYear(), now.getMonth());
// weeks = Date[][] (4-6 rows of 7 days, Mon-Sun)

// 2. Get the data range for fetching items from the API
const range = calendar.getDateRange("month", now);
const items = await api.getItems({ from: range.from, to: range.to });

// 3. For each day cell, filter items that belong to that day
weeks.forEach(week =>
  week.forEach(day => {
    const dayItems = calendar.getDayItems(items, day);
    const isCurrentMonth = calendar.isSameMonth(day, now);
    const isCurrentDay = calendar.isToday(day);
    // render cell with dayItems, dim if !isCurrentMonth, highlight if isCurrentDay
  })
);

// 4. Navigation: previous/next month
const prev = calendar.addMonths(now, -1);
const next = calendar.addMonths(now, 1);
```

Remember: `getMonthGrid` month parameter is 0-indexed (0 = January). `WEEKDAYS_SHORT` is Monday-first -- do not index with `Date.getDay()`.

---

## 6. URL State Management

**When to use:** Syncing UI state (filters, pagination, view mode) with URL query parameters for shareable/bookmarkable URLs.

```ts
import { searchParams } from "@valentinkolb/stdlib";

type Filters = { page: number; sort: string; active: boolean };

// Read current state from URL: ?page=2&sort=name&active=true
const state = searchParams.deserialize<Filters>();
// { page: 2, sort: "name", active: true }

// Update URL when user changes a filter
function updateFilters(updates: Partial<Filters>) {
  const qs = searchParams.serialize<Filters>(updates);
  window.history.pushState({}, "", `?${qs}`);
}
updateFilters({ page: 3 });           // ?page=3&sort=name&active=true
updateFilters({ active: false });      // ?page=3&sort=name (active=false is removed)

// Listen for back/forward navigation
const cleanup = searchParams.onChange<Filters>((params) => {
  renderTable(params); // re-render with updated filters
});
// cleanup() on unmount
```

Gotchas: `false`, `null`, `undefined`, and `""` all cause the param to be **deleted** during serialization. `onChange` only fires on `popstate` (back/forward), not on `pushState`/`replaceState`.

---

## 7. Timing Composition

**When to use:** Retry logic with backoff and jitter, or preventing UI spinner flicker on fast responses.

```ts
import { timing } from "@valentinkolb/stdlib";

// Retry with exponential backoff + jitter
async function fetchWithRetry<T>(url: string, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetch(url).then(r => r.json());
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      const baseDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await timing.sleep(timing.jitter(baseDelay, baseDelay * 0.3));
    }
  }
  throw new Error("unreachable");
}

// Prevent spinner flicker: ensure loading takes at least 500ms
const data = await timing.withMinLoadTime(
  () => fetchWithRetry("/api/data"),
  500,
);
```

`jitter` uses `crypto.getRandomValues` (cryptographically secure). The offset is uniformly distributed in `[-range, +range]`. `withMinLoadTime` defaults to 300ms if no minimum is specified.

---

## 8. Text Pipeline

**When to use:** Transforming user-provided strings for different display contexts (URLs, headings, labels).

```ts
import { text } from "@valentinkolb/stdlib";

const userInput = "Hello World -- My Blog Post!";

// URL slug: lowercase, hyphenated, stripped diacritics
const slug = text.slugify(userInput);
// "hello-world-my-blog-post"

// Display label: first letter capitalized, separators become spaces
const label = text.humanize("user_first_name");
// "User first name"

// Heading: every word capitalized
const heading = text.titleify("hello_world-foo");
// "Hello World Foo"

// File size display
const size = text.pprintBytes(15728640);
// "15.0 MB"
```

`slugify` applies NFKD normalization and strips diacritics, so "Uber uns" becomes "uber-uns". `pprintBytes` uses binary units (1 KB = 1024 bytes) and handles edge cases (`NaN`, `Infinity`, `0` all return `"0 bytes"`).

---

## 9. SSE + Result for Streaming API Calls

**When to use:** Consuming a streaming API endpoint (e.g. AI chat completions, live feeds) with typed error handling around the fetch call.

```ts
import { streaming, result } from "@valentinkolb/stdlib";

async function streamEvents(url: string) {
  const res = await result.tryCatch(() => fetch(url));
  if (!res.ok) return res;

  for await (const event of streaming.parseSSE(res.data.body!)) {
    const payload = JSON.parse(event.data);
    if (payload.done) break;
    process(payload);
  }
  return result.ok();
}
```

`tryCatch` catches network errors before streaming begins. Inside the loop, each SSE event is parsed individually. Combine with `text.truncate` or `text.summarize` to keep displayed output within bounds.

---

## 10. Debounce + Cache for Search Inputs

**When to use:** Building a search-as-you-type UI where expensive lookups are debounced and results are cached to avoid refetching.

```ts
import { timing, cache } from "@valentinkolb/stdlib";

const searchCache = cache.create<SearchResult[]>({ ttl: 2 * 60_000 });

const search = timing.debounce(async (query: string) => {
  const cached = await searchCache.get(query);
  if (cached) return renderResults(cached);

  const results = await fetch(`/api/search?q=${query}`).then(r => r.json());
  await searchCache.set(query, results);
  renderResults(results);
}, 300);

input.addEventListener("input", (e) => search(e.target.value));
```

`debounce` waits 300ms after the last keystroke. `cache.create` stores results by query string so revisiting a previous query is instant. Call `search.cancel()` on component teardown.
