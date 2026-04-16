# Solid Modules

```ts
import { mutation, timed, hotkeys, dnd, detailPanel, localStore, clipboard, clickOutside, dropzone, a11y } from "@valentinkolb/stdlib/solid";
```

All exports require SolidJS and must be called inside a reactive owner (component or `createRoot`).

## mutation

Async mutation controller with reactive signals, lifecycle hooks, abort, and retry.

```tsx
import { mutation } from "@valentinkolb/stdlib/solid";

const { data, error, loading, mutate, abort, retry } = mutation.create({
  mutation: async (vars: { name: string }, { abortSignal }) => {
    const res = await fetch("/api/items", {
      signal: abortSignal,
      method: "POST",
      body: JSON.stringify(vars),
    });
    return res.json();
  },
  onBefore: (vars) => ({ optimisticId: crypto.randomUUID() }),
  onSuccess: (data) => console.log("Created:", data),
  onError: (err) => console.error("Failed:", err),
  onFinally: () => console.log("Done"),
});

mutate({ name: "New Item" });
abort();   // cancel in-flight request
retry();   // retry with same args (skips onBefore)
```

Signals: `data()`, `error()`, `loading()` are all reactive.

## timed

Reactive debounce and interval with automatic cleanup on component unmount.

### Debounce

```tsx
import { timed } from "@valentinkolb/stdlib/solid";

const { debouncedFn, trigger, cancel, isPending } = timed.debounce(
  (text: string) => saveSearch(text),
  500,
);

debouncedFn("hello");     // debounced
trigger("immediate");     // execute now
cancel();                 // cancel pending
isPending();              // boolean
```

### Interval

```tsx
const { start, stop, execute, isRunning } = timed.interval(
  () => fetchUpdates(),
  5000,
  { autoStart: true, executeImmediately: true },
);

stop();
start();
execute();    // run callback once without affecting interval
isRunning();  // boolean
```

## hotkeys

Global keyboard shortcut registry. The `mod` alias resolves to `Cmd` on Mac, `Ctrl` elsewhere.

```tsx
import { hotkeys } from "@valentinkolb/stdlib/solid";

const { entries, dispose } = hotkeys.create({
  "mod+s": { label: "Save", run: () => save() },
  "mod+shift+z": { label: "Redo", run: () => redo() },
  "mod+k": { label: "Search", run: () => openSearch(), desc: "Open search" },
  "escape": { label: "Close", run: () => close(), inInput: true },
});

// entries() returns metadata for rendering a help overlay
// [{ keys: "mod+s", keysPretty: [{ key: "Cmd", ariaLabel: "Command" }, ...], label: "Save" }]
```

Hotkeys are registered on mount and unregistered on cleanup. Duplicate combos are ignored with a warning.

## dnd

Drag-and-drop with pointer and keyboard support. Uses SolidJS directives.

```tsx
import { dnd } from "@valentinkolb/stdlib/solid";

const { draggable, droppable, isDragging, activeId, overId } = dnd.create({
  onDrop: ({ active, over, intent }) => {
    if (over) reorder(active.id, over.id);
  },
  onDragStart: ({ active }) => console.log("Dragging:", active.id),
  announcements: {
    dragStart: (active) => `Picked up ${active.id}`,
    drop: (active, over) => `Dropped ${active.id} on ${over?.id}`,
  },
});

// JSX
<div use:draggable={{ id: "item-1", meta: item1 }}>Drag me</div>
<div use:droppable={{ id: "zone-a", meta: zoneA }}>Drop here</div>
```

Supports activation distance, touch delay, custom collision detection, intent building, handle selectors, and ARIA live announcements.

## detailPanel

Hybrid SSR + client-side detail panel pattern. Updates URL params without page reloads and supports browser back/forward.

```tsx
import { detailPanel } from "@valentinkolb/stdlib/solid";

// In the detail panel component
const { item, itemKey } = detailPanel.createPanel({
  paramName: "user",
  eventName: "user-detail-select",
  initialItem: props.initialUser,
  initialKey: props.initialUserId,
  items: props.users,
  getItemKey: (user) => user.id,
});

// In the list component
const { selectedKey, select, deselect } = detailPanel.createList({
  paramName: "user",
  eventName: "user-detail-select",
  initialKey: props.selectedUserId,
});

<div onClick={() => select(user, user.id)}>
  {user.name}
</div>
```

## localStore

Reactive SolidJS store with automatic localStorage persistence and cross-tab sync via BroadcastChannel.
For simple non-reactive cookie storage, see `cookies` from `@valentinkolb/stdlib/browser`.

```tsx
import { localStore } from "@valentinkolb/stdlib/solid";

// Single record
const [user, setUser] = localStore.create("user", { name: "", email: "" });
setUser("name", "John");  // persisted + synced across tabs

// Query multiple keys
const [pads, reload] = localStore.query((key) => key.startsWith("pad:"));

// Direct operations
localStore.modify("user", (prev) => ({ ...prev, name: "Jane" }));
localStore.remove("user");
localStore.exists("user");  // boolean
localStore.read("user");    // T | null
```

## clipboard

Reactive clipboard hook with auto-resetting copy-feedback signal.
Wraps `clipboard.copy()` from `@valentinkolb/stdlib/browser` with a `wasCopied` signal that resets after a timeout.

```tsx
import { clipboard } from "@valentinkolb/stdlib/solid";

const { copy, wasCopied } = clipboard.create(2000);

<button onClick={() => copy("Hello!")}>
  {wasCopied() ? "Copied!" : "Copy"}
</button>
```

`wasCopied()` resets to `false` after the timeout (default 2000ms).

## clickOutside

Click-outside detection using a ref callback. Uses `mousedown` to detect before the element's own click handlers fire.

```tsx
import { clickOutside } from "@valentinkolb/stdlib/solid";

const ref = clickOutside.create(() => setOpen(false));

<div ref={ref}>
  Dropdown content
</div>
```

## dropzone

Headless file drop zone with MIME type validation and nested-element-safe drag tracking.

```tsx
import { dropzone } from "@valentinkolb/stdlib/solid";

const { isDragging, invalidDrag, handlers } = dropzone.create({
  onDrop: (files) => uploadFiles(files),
  accept: "image/*",
});

<div
  {...handlers}
  classList={{
    "border-blue-500": isDragging(),
    "border-red-500": invalidDrag(),
  }}
>
  Drop images here
</div>
```

## a11y

Accessible event handler spreads for non-button interactive elements.

```tsx
import { a11y } from "@valentinkolb/stdlib/solid";

<div role="button" tabindex="0" {...a11y.clickOrEnter(handleAction)}>
  Click or press Enter
</div>
```

Returns `{ onClick, onKeyDown }` handlers that fire on click, Enter, and Space.
