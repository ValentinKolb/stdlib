# @valentinkolb/stdlib

Generic TypeScript utility library -- crypto, encoding, dates, files, images, and SolidJS primitives.

**Why?** I kept reimplementing the same micro-utilities across [my projects](https://github.com/ValentinKolb). This package consolidates them in one place with consistent APIs, thorough tests, and minimal dependencies.

## Design goals

- **Native-first** -- modern browsers ship incredibly powerful APIs (Web Crypto, Intl, CompressionStream, OPFS, ...) but they tend to be verbose and awkward to use directly. This library wraps them into ergonomic, composable functions. As a result the entire package needs only two optional peer dependencies (`lean-qr`, `solid-js`) -- which means smaller bundles, faster installs, better long-term support, and fewer supply-chain risks.
- **Tree-shakeable** -- import only what you need from three entry points
- **TypeScript-first** -- strict mode, full type inference, no `any`

## Installation

```bash
bun add @valentinkolb/stdlib

# Install the two optional dependencies
bun add solid-js lean-qr
```

## Entry Points

| Import | Environment | What's inside |
|---|---|---|
| `@valentinkolb/stdlib` | Universal | encoding, crypto, password, dates, text, cache, result, qr, svg, timing, streaming, search-params, file-icons, gradients |
| `@valentinkolb/stdlib/browser` | Browser | files, images, cookies, clipboard, notifications, kv-store, theme |
| `@valentinkolb/stdlib/solid` | SolidJS | mutation, timed, hotkeys, dnd, detail-panel, localstorage, clipboard, click-outside, dropzone, a11y |

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
  console.log(`Last seen: ${dates.formatDateRelative(user.lastSeen)}`);
}

// Sync filters to URL
const query = searchParams.serialize({ page: 1, active: true });
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

*These examples combine a few of the 29+ modules available across three entry points -- see the [full documentation](./docs/) for the complete API.*

## Documentation

```
docs/core.md      -- encoding, crypto, password, dates, text, cache, result, qr, svg, streaming, ...
docs/browser.md   -- files, images, cookies, clipboard, notifications, kv-store, theme
docs/solid.md     -- mutation, hotkeys, dnd, timed, localstorage, ...
```

## Agent Skills

```bash
bunx skills add github.com/ValentinKolb/stdlib
```

## License

ISC
