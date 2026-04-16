---
name: stdlib
description: >
  Use this skill whenever code imports from @valentinkolb/stdlib or when the
  user needs help choosing the right utility module for encoding, crypto, dates,
  files, images, caching, storage, SolidJS primitives, or any general-purpose
  TypeScript utility. Trigger broadly: any mention of hashing, encryption, QR
  codes, file downloads, image processing, drag-and-drop, hotkeys, clipboard,
  cookies, localStorage, notifications, search params, timing, text formatting,
  calendars, gradients, file icons, SVG avatars, result types, or password
  generation should activate this skill.
---

# @valentinkolb/stdlib -- Overview & Module Picker

`@valentinkolb/stdlib` is a zero-dependency-on-each-other collection of
TypeScript utility modules organized into three entry points. Every module
exports a namespace object (e.g. `crypto`, `images`, `cache`) so you can
tree-shake what you don't use. The library targets both browser and
server/Bun runtimes; browser-only and SolidJS-only modules live in dedicated
sub-paths.

## Entry Points

| Import path | Runtime | Modules |
|---|---|---|
| `@valentinkolb/stdlib` | Universal (browser + server) | `encoding`, `crypto`, `dates`, `calendar`, `fileicons`, `gradients`, `result`, `qr`, `svg`, `timing`, `text`, `searchParams`, `cache` |
| `@valentinkolb/stdlib/browser` | Browser only (DOM required) | `images`, `files`, `cookies`, `clipboard`, `notifications`, `kvStore` |
| `@valentinkolb/stdlib/solid` | SolidJS components | `mutation`, `timed`, `hotkeys`, `dnd`, `detailPanel`, `localStore`, `clipboard`, `clickOutside`, `dropzone`, `a11y` |

## Which module do I need?

### Crypto & Security
| I need to... | Module | Entry point |
|---|---|---|
| Hash a string (SHA-256) | `crypto.common.hash` | core |
| Hash synchronously (non-crypto) | `crypto.common.fnv1aHash` | core |
| Generate a UUID | `crypto.common.uuid` | core |
| Generate a readable ID | `crypto.common.readableId` | core |
| Generate a symmetric key | `crypto.common.generateKey` | core |
| Generate a random/memorable/PIN password | `crypto.password.random/memorable/pin` | core |
| Sign/verify with ECDSA (asymmetric) | `crypto.asymmetric.sign/verify` | core |
| Encrypt/decrypt with ECDH+AES-GCM (asymmetric) | `crypto.asymmetric.encrypt/decrypt` | core |
| Generate an asymmetric key pair | `crypto.asymmetric.generate` | core |
| Encrypt/decrypt with AES-GCM (symmetric, password or key) | `crypto.symmetric.encrypt/decrypt` | core |
| Set up TOTP (2FA) | `crypto.totp.create/verify` | core |

### Encoding
| I need to... | Module | Entry point |
|---|---|---|
| Convert bytes to/from Base64, Hex, or Base32 | `encoding.toBase64/fromBase64/toHex/fromHex/toBase32/fromBase32` | core |

### Data & Error Handling
| I need to... | Module | Entry point |
|---|---|---|
| Return typed success/error results | `ok()`, `fail()`, `err.*`, `unwrap()`, `tryCatch()` | core (`result`) |
| Paginate query results | `paginate()`, `okMany()` | core (`result`) |

### Dates, Time & Scheduling
| I need to... | Module | Entry point |
|---|---|---|
| Format dates (`"05 Mar 2025"`) | `dates.formatDate/formatDateTime` | core |
| Show relative time (`"3 mins ago"`) | `dates.formatDateTimeRelative` | core |
| Format durations | `dates.formatDuration` | core |
| Build a calendar month grid | `calendar.getMonthGrid` | core |
| Sleep / add jitter / random numbers | `timing.sleep/jitter/random/shuffle` | core |
| Buffer writes (coalesce by key) | `timing.buffer` | core |
| Enforce minimum load time | `timing.withMinLoadTime` | core |
| Debounce/interval (SolidJS reactive) | `timed.debounce/interval` | solid |

### Text & Display
| I need to... | Module | Entry point |
|---|---|---|
| Slugify a string | `text.slugify` | core |
| Humanize/titleify a string | `text.humanize/titleify` | core |
| Pretty-print byte sizes | `text.pprintBytes` | core |
| Get a file icon/category | `fileicons.getFileCategory/getFileIcon` | core |
| Get gradient presets for names | `gradients.gradientPresets` | core |

### QR Codes & SVG
| I need to... | Module | Entry point |
|---|---|---|
| Generate a QR code for WiFi/email/phone/vCard/event | `qr.wifi/email/tel/vcard/event` | core |
| Render a QR code as SVG | `qr.toSvg` | core |
| Generate a deterministic avatar SVG | `svg.generateAvatar` | core |
| Parse a WebP data URL | `svg.parseWebpDataUrl` | core |

### Caching
| I need to... | Module | Entry point |
|---|---|---|
| Cache values in memory with TTL | `cache.create` | core |
| Auto-fetch on cache miss | `cache.create({ onMiss })` | core |

### URL & Search Params
| I need to... | Module | Entry point |
|---|---|---|
| Serialize/deserialize URL search params | `searchParams.serialize/deserialize` | core |
| React to URL param changes | `searchParams.onChange` | core |

### Browser -- Files & Downloads
| I need to... | Module | Entry point |
|---|---|---|
| Download a file from content | `files.downloadFileFromContent` | browser |
| Create/download a ZIP archive | `files.createZip/downloadAsZip` | browser |
| Open a file/folder picker dialog | `files.showFileDialog/showFolderDialog` | browser |
| Build safe file paths | `` files.path`uploads/${name}` `` | browser |
| Check MIME types | `files.checkMimeType/mimeTypesToAccept` | browser |
| Read/write to Origin Private File System | `files.OPFS.write/read/delete/ls` | browser |

### Browser -- Images
| I need to... | Module | Entry point |
|---|---|---|
| Load and process images (resize, crop, filter, rotate, flip) | `images.create/resize/crop/filter/rotate/flip` | browser |
| Export as Blob/File/Base64/Canvas | `images.toBlob/toFile/toBase64/toCanvas` | browser |
| Batch-process images with progress | `images.batch` | browser |
| Quick avatar/thumbnail presets | `images.presets.avatar/thumbnail` | browser |

### Browser -- Storage & State
| I need to... | Module | Entry point |
|---|---|---|
| Store large/binary data persistently (OPFS-backed) | `kvStore.set/get/setBytes/getBytes` | browser |
| Watch for kvStore changes (cross-tab) | `kvStore.watch` | browser |
| Read/write cookies (raw or JSON) | `cookies.readCookie/writeCookie/readJsonCookie/writeJsonCookie` | browser |
| Copy text to clipboard | `clipboard.copy` | browser |
| Show native notifications | `notifications.show/requestPermission` | browser |

### SolidJS Primitives
| I need to... | Module | Entry point |
|---|---|---|
| Reactive localStorage with cross-tab sync | `localStore.create/query` | solid |
| Async mutation with loading/error/abort/retry | `mutation.create` | solid |
| Drag and drop (pointer + keyboard) | `dnd.create` | solid |
| Global keyboard shortcuts | `hotkeys.create/entries` | solid |
| File drop zone | `dropzone.create` | solid |
| Click-outside detection | `clickOutside.create` | solid |
| Reactive clipboard with copy feedback | `clipboard.create` | solid |
| Hybrid SSR detail panel | `detailPanel.create` | solid |
| Debounce / interval (lifecycle-aware) | `timed.debounce/interval` | solid |
| Make non-buttons accessible | `a11y.clickOrEnter` | solid |

## Cross-Cutting Patterns

- **Namespace objects** -- every module exports a namespace (`crypto`, `images`, `cache`, etc.) with its functions as methods. Individual functions are also available as named exports for direct import.
- **Functional pipelines** -- `images` uses a `.then()` chaining pattern where each transform returns a function `(ImgData | Promise<ImgData>) => Promise<T>`.
- **Result types** -- use `result.tryCatch` to wrap any async operation; combine with `result.ok/fail/err.*` for typed error handling across the stack.
- **TTL caching + lazy loading** -- `cache.create({ onMiss, beforePurge })` lets you build transparent caching layers around any data source.
- **Cross-tab sync** -- both `kvStore` (via BroadcastChannel) and `localStore` (via BroadcastChannel) keep data synchronized across browser tabs automatically.

## Detailed API Reference

For full API documentation on each entry point, read the specific skill:

- **`stdlib-core`** -- encoding, crypto, result, dates, calendar, qr, svg, text, timing, cache, searchParams, fileicons, gradients
- **`stdlib-browser`** -- images, files, cookies, clipboard, notifications, kvStore
- **`stdlib-solid`** -- localStore, mutation, dnd, hotkeys, dropzone, clickOutside, clipboard, detailPanel, timed, a11y
