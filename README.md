# @valentinkolb/stdlib

Generic TypeScript utility library -- crypto, encoding, dates, display helpers, files, images, and SolidJS primitives.

**Why?** I kept reimplementing the same micro-utilities across [my projects](https://github.com/ValentinKolb). This package consolidates them in one place with consistent APIs, thorough tests, and minimal dependencies.

## Design goals

- **Native-first** -- modern browsers ship incredibly powerful APIs (Web Crypto, Intl, CompressionStream, OPFS, ...) but they tend to be verbose and awkward to use directly. This library wraps them into ergonomic, composable functions, using a small runtime dependency (`dayjs`) only where full IANA timezone calendar math needs it. QR and SolidJS stay behind optional peer dependencies (`lean-qr`, `solid-js`).
- **Tree-shakeable** -- import only what you need from three entry points
- **TypeScript-first** -- strict mode, full type inference, no `any`

## Installation

```bash
bun add @valentinkolb/stdlib

# Install optional dependencies for QR and SolidJS helpers
bun add solid-js lean-qr
```

## Entry Points

| Import | Environment | What's inside |
|---|---|---|
| `@valentinkolb/stdlib` | Universal | encoding, crypto, password, dates, text, fuzzy, highlight, charts, cache, result, svg, timing, streaming, search-params, file-icons, gradients |
| `@valentinkolb/stdlib/qr` | Universal (requires `lean-qr`) | qr -- WiFi/email/tel/vCard/event payload generators and SVG rendering |
| `@valentinkolb/stdlib/browser` | Browser-only | files (OPFS, ZIP), images (canvas pipeline), cookies, clipboard, notifications, **kvStore** (OPFS-backed key-value, cross-tab `watch` subscriptions), theme |
| `@valentinkolb/stdlib/solid` | SolidJS | mutation, timed, hotkeys, dnd, detail-panel, localstorage, clipboard, click-outside, dropzone, a11y |

The split is by **runtime requirement**, not import preference: `browser` modules touch DOM/OPFS/BroadcastChannel and would crash in Bun/Node if imported from the root entry. Use the subpath that matches the environment you're targeting.

## Quick Start

### Process & Cache Images

```typescript
import { crypto, text } from "@valentinkolb/stdlib";
import { images, kvStore } from "@valentinkolb/stdlib/browser";

// Load, resize, and cache a user-uploaded photo
const img = await images.create(uploadedFile);
const processed = await Promise.resolve(img)
  .then(images.resize(800, 600, "cover"))
  .then(images.toBlob("webp", 0.85));

const hash = await crypto.common.hash(new Uint8Array(await processed.arrayBuffer()));
await kvStore.setBytes(`cache:${hash}`, new Uint8Array(await processed.arrayBuffer()));

console.log(`Cached ${text.pprintBytes(processed.size)} image`);
```

### API Data with Error Handling

```typescript
import { result, dates, cache, searchParams } from "@valentinkolb/stdlib";

const userCache = cache.create<User>({
  ttl: 5 * 60_000,
  onMiss: async (id) => {
    const res = await result.tryCatch(() => api.fetchUser(id));
    return res.ok ? res.data : null;
  },
});

const user = await userCache.get("user:123");
if (user) {
  const timeZone = dates.normalizeTimeZone(user.timeZone, "UTC");
  console.log(`Last seen: ${dates.formatDateRelative(user.lastSeen, { timeZone })}`);
}

// Edit stored UTC instants in a user's timezone
const startsAtInput = dates.instantToZonedInput(event.startsAt, user.timeZone);
const startsAt = dates.zonedDateTimeToInstant(startsAtInput, user.timeZone);

// Sync filters to URL
const query = searchParams.serialize({ page: 1, active: true });
```

### Command Palette with Highlighted Matches

```typescript
import { fuzzy } from "@valentinkolb/stdlib";

const commands = [
  { id: "open-file", label: "Open File" },
  { id: "save-doc", label: "Save Document" },
  { id: "user-settings", label: "User Settings" },
  // ... hundreds more
];

// Rank by fuzzy match, take top 10
const hits = fuzzy.filter("uss", commands, { key: c => c.label, limit: 10 });

// Render with <mark>-highlighted matched characters
for (const hit of hits) {
  const html = fuzzy.segments(hit.target, hit.ranges)
    .map(s => s.match ? `<mark>${s.text}</mark>` : s.text)
    .join("");
  // for "User Settings": "<mark>Us</mark>er <mark>S</mark>ettings"
}

// Did-you-mean typo correction
fuzzy.closest("primry", ["primary", "secondary", "tertiary"]);
// { value: "primary", distance: 1, similarity: 0.86 }
```

### Headless Syntax Highlighting

```typescript
import { highlight } from "@valentinkolb/stdlib";

// Markdown preview for textarea overlays. Returns escaped HTML with semantic classes.
preview.innerHTML = highlight.markdown(markdownText, {
  knownLabels: new Set(["#roadmap", "@team"]),
});

// Completion overlay: injects a ghost or caret anchor before the highlighter runs.
preview.innerHTML = highlight.overlay(markdownText, highlight.markdown, {
  ghost: { at: cursorOffset, text: "uggestion" },
});

// Domain-specific languages: compile once, reuse on every input event.
const renderFormula = highlight.compile([
  { kind: "comment", match: /#.*/ },
  { kind: "string", match: /"(?:\\.|[^"])*"/ },
  { kind: "variable", match: /\$[a-zA-Z_]\w*/ },
  { kind: "keyword", match: /\b(IF|THEN|ELSE|SUM)\b/ },
  { kind: "number", match: /\b\d+(?:\.\d+)?\b/ },
  { kind: "operator", match: /[+\-*/=<>!]+/ },
]);
```

### Dashboard with Inline SVG Charts

```typescript
import { charts } from "@valentinkolb/stdlib";

// Bar chart with title, value labels, target reference, formatted axis
const revenue = charts.bar({
  title: "Quarterly Revenue",
  data: [
    { label: "Q1", value: 124 }, { label: "Q2", value: 187 },
    { label: "Q3", value: 162 }, { label: "Q4", value: 215 },
  ],
  yAxis: { format: v => `€${v}k` },
  references: [{ value: 200, label: "Target" }],
  showValues: true,
});

// Inline sparkline for a metric-row trend indicator
const trend = charts.sparkline({
  data: weeklyVisitors,
  smooth: true, showMinMax: true, showLast: true,
});

// Scientific scatter with error bars and linear-regression overlay
const correlation = charts.scatter({
  series: [{ data: trials.map(t => ({ x: t.id, y: t.mean, errY: t.sd })) }],
  trendline: true,
  yAxis: { label: "Reaction (ms ± σ)" },
});

// All functions return SVG strings — inject via innerHTML or write to disk
document.getElementById("revenue").innerHTML = revenue;
```

### Reactive Cross-Tab Storage

```typescript
import { kvStore } from "@valentinkolb/stdlib/browser";

// Persistent OPFS-backed key-value storage (async, no 5 MB cap, cross-tab via BroadcastChannel)
await kvStore.set("user:1", { name: "Alice", lastSeen: Date.now() });
await kvStore.setBytes("files:photo.raw", largeUint8Array);

// React to changes — fires for local writes AND writes from other tabs
const unwatch = kvStore.watch(
  (event) => {                   // event = { type: "set" | "delete" | "clear", key }
    if (event.type === "set") refreshUI(event.key);
  },
  "user:",                       // optional prefix filter
);

// Later: stop watching (e.g. component unmount)
unwatch();
```

### Interactive SolidJS Editor

```typescript
import { mutation, timed, hotkeys } from "@valentinkolb/stdlib/solid";
import { notifications } from "@valentinkolb/stdlib/browser";

const save = mutation.create({
  mutation: (doc) => api.saveDocument(doc),
  onSuccess: () => notifications.show({ title: "Saved", body: "Document saved.", autoCloseMs: 3000 }),
});

const autoSave = timed.debounce(() => save.mutate(currentDoc()), 2000);

hotkeys.create({
  "mod+s": { label: "Save", run: () => save.mutate(currentDoc()) },
  "mod+shift+s": { label: "Save & Close", run: () => { save.mutate(currentDoc()); navigate("/"); } },
});
```

*These examples combine a few of the 30+ modules available across four entry points -- see the [full documentation](./docs/) for the complete API.*

## Documentation

```
docs/core.md      -- encoding, crypto, password, dates, text, fuzzy, highlight, charts, cache, result, svg, streaming, ...
docs/browser.md   -- files, images, cookies, clipboard, notifications, kv-store, theme
docs/solid.md     -- mutation, hotkeys, dnd, timed, localstorage, ...

# qr lives behind its own subpath because lean-qr is an optional peer dep
import { qr } from "@valentinkolb/stdlib/qr";
```

## Agent Skills

```bash
bunx skills add github.com/ValentinKolb/stdlib
```

## License

ISC
