---
name: stdlib-solid
description: |
  SolidJS reactive primitives from @valentinkolb/stdlib/solid.
  Covers: mutation (async mutation controller with loading/error/abort/retry), timed (debounce and interval with auto-cleanup), hotkeys (global keyboard shortcut registry with Mac symbol support), dnd (drag-and-drop with pointer+keyboard, ghost elements, collision detection, ARIA live regions), detailPanel (URL-synced detail panel with browser history), localStore (reactive localStorage with cross-tab BroadcastChannel sync), clipboard (reactive copy-to-clipboard with timeout indicator), clickOutside (click-outside detection), dropzone (file drop zone with MIME validation), a11y (clickOrEnter accessibility handler).
  Trigger when: code imports from "@valentinkolb/stdlib/solid", or when building SolidJS apps needing async mutations, keyboard shortcuts/hotkeys, drag-and-drop, reactive localStorage, debounce/interval timers, clipboard copy feedback, click-outside detection, file drop zones, or accessibility helpers.
---

# stdlib-solid -- SolidJS Reactive Primitives

All primitives are imported from a single entry point:

```ts
import { mutation, timed, hotkeys, dnd, detailPanel, localStore, clipboard, clickOutside, dropzone, a11y } from "@valentinkolb/stdlib/solid";
```

## Key Patterns

- All primitives that register listeners or timers auto-cleanup via SolidJS `onCleanup`.
- Most `create` functions must be called inside a SolidJS component or reactive owner (`createRoot`).
- Each module is exported as a namespace object with static methods (e.g. `mutation.create(...)`, `timed.debounce(...)`).

---

## mutation

Async mutation controller with reactive loading/error/data signals, abort, and retry. Follows a pattern similar to React Query's `useMutation`.

### API

```ts
mutation.create<T, V, C = unknown>(options: MutationOptions<T, V, C>): MutationResult<T, V, C>
```

**MutationOptions<T, V, C>:**

| Field | Type | Description |
|---|---|---|
| `mutation` | `(vars: V, ctx: C & { abortSignal: AbortSignal }) => Promise<T>` | The async mutation function. Always receives an `abortSignal` in the context. |
| `initialData?` | `T` | Initial value for the data signal. |
| `onBefore?` | `(vars: V) => C \| Promise<C>` | Hook before mutation starts. Returns base context. NOT re-executed on `retry()`. |
| `onSuccess?` | `(data: T, ctx?) => void` | Called on successful completion. |
| `onError?` | `(error: Error, ctx?) => void` | Called on error. |
| `onAbort?` | `(ctx?) => void` | Called when aborted via `abort()`. |
| `onFinally?` | `(ctx?) => void` | Called after completion regardless of outcome. |

**MutationResult<T, V, C>:**

| Field | Type | Description |
|---|---|---|
| `data` | `Accessor<T \| null>` | Reactive signal with mutation result. |
| `error` | `Accessor<Error \| null>` | Reactive signal with error. |
| `loading` | `Accessor<boolean>` | Reactive signal indicating in-progress. |
| `mutate` | `(vars: V) => Promise<void>` | Triggers the mutation. Executes `onBefore`. |
| `abort` | `() => void` | Aborts the current in-flight mutation. |
| `retry` | `() => Promise<void>` | Retries with same vars/context. Skips `onBefore`. |

### Example

```tsx
const { data, error, loading, mutate, abort, retry } = mutation.create({
  mutation: async (vars: { name: string }, { abortSignal }) => {
    const res = await fetch("/api/items", {
      signal: abortSignal,
      method: "POST",
      body: JSON.stringify(vars),
    });
    return res.json();
  },
  onBefore: (vars) => {
    console.log("Starting mutation for:", vars.name);
    return { timestamp: Date.now() };
  },
  onSuccess: (data) => console.log("Created:", data),
  onError: (err) => console.error("Failed:", err),
});

// Trigger
mutate({ name: "New Item" });

// Abort in-flight request
abort();

// Retry last mutation (skips onBefore)
retry();

// Reactive UI
return (
  <div>
    <Show when={loading()}>Saving...</Show>
    <Show when={error()}>{(e) => <p>Error: {e().message}</p>}</Show>
    <Show when={data()}>{(d) => <p>Result: {JSON.stringify(d())}</p>}</Show>
  </div>
);
```

---

## timed

Debounce and interval utilities with automatic cleanup via `onCleanup`.

### timed.debounce

```ts
timed.debounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): {
  debouncedFn: (...args: Parameters<T>) => void;
  trigger: (...args: Parameters<T>) => void;  // immediate execution
  cancel: () => void;
  isPending: () => boolean;
}
```

Must be called inside a SolidJS reactive owner. Registers `onCleanup` to cancel pending timers.

#### Example

```tsx
const { debouncedFn, trigger, cancel, isPending } = timed.debounce(
  (text: string) => saveToServer(text),
  500
);

// Debounced call
debouncedFn("hello");

// Force immediate execution
trigger("save now");

// Cancel pending execution
cancel();

// Check status
if (isPending()) console.log("Save pending...");
```

### timed.interval

```ts
timed.interval(
  callback: () => void,
  delay: number,
  options?: {
    autoStart?: boolean;          // default: true
    executeImmediately?: boolean; // default: true
  }
): {
  start: () => void;
  stop: () => void;
  execute: () => void;   // run callback once without affecting interval
  isRunning: () => boolean;
}
```

Must be called inside a SolidJS reactive owner. Registers `onCleanup` to stop the interval.

#### Example

```tsx
// Auto-starts and executes immediately by default
const { stop, isRunning } = timed.interval(
  () => fetchUpdates(),
  5000
);

// Manual control
const { start, stop, execute, isRunning } = timed.interval(
  () => pollServer(),
  2000,
  { autoStart: false, executeImmediately: false }
);

start();    // begin interval
execute();  // run once without affecting interval
stop();     // stop interval
```

---

## hotkeys

Global keyboard shortcut registry. Uses a module-level singleton -- all components share one registry. Mac-aware: renders modifier symbols and resolves `mod` to Command/Ctrl.

### API

```ts
hotkeys.create(
  config?: HotkeyMap | (() => HotkeyMap | Promise<HotkeyMap>)
): {
  entries: Accessor<RegisteredHotkeyMeta[]>;  // all registered hotkeys
  dispose: () => void;                        // unregister all from this call
}

hotkeys.entries: Accessor<RegisteredHotkeyMeta[]>  // global reactive signal of all registered hotkeys
```

**HotkeyMap:** `Record<string, HotkeyDefinition>`

**HotkeyDefinition:**

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Display label for the hotkey. |
| `run` | `() => void \| Promise<void>` | Handler function. |
| `desc?` | `string` | Optional description. |
| `inInput?` | `true` | If set, hotkey fires even inside text inputs. |

**RegisteredHotkeyMeta:**

| Field | Type | Description |
|---|---|---|
| `keys` | `string` | Normalized key combo (e.g. `"mod+s"`). |
| `keysPretty` | `PrettyKeyPart[]` | Display-friendly parts with `key` and `ariaLabel`. |
| `label` | `string` | The label. |
| `desc?` | `string` | Optional description. |

**PrettyKeyPart:** `{ key: string; ariaLabel: string }`

Key combo format: modifiers joined with `+`. Use `mod` for platform-aware Command/Ctrl. Example combos: `"mod+s"`, `"mod+shift+z"`, `"alt+k"`, `"escape"`.

On Mac, `mod` renders as the Command symbol. Modifier display: Meta/Cmd, Alt/Option, Shift, Ctrl all get Mac symbols automatically.

### Example

```tsx
// Inside a component -- auto-cleanup on unmount
const { entries } = hotkeys.create({
  "mod+s": {
    label: "Save",
    desc: "Save the current document",
    run: () => save(),
  },
  "mod+shift+z": {
    label: "Redo",
    run: () => redo(),
  },
  "escape": {
    label: "Close",
    run: () => closePanel(),
  },
});

// Render a hotkey help overlay
return (
  <ul>
    <For each={hotkeys.entries()}>
      {(entry) => (
        <li>
          <For each={entry.keysPretty}>
            {(part) => <kbd aria-label={part.ariaLabel}>{part.key}</kbd>}
          </For>
          {" "}{entry.label}
        </li>
      )}
    </For>
  </ul>
);
```

---

## dnd

Drag-and-drop system with pointer and keyboard support, ghost element rendering, collision detection, and ARIA live region announcements.

### API

```ts
dnd.create<TDragMeta, TDropMeta, TIntent>(
  options?: DndCreateOptions<TDragMeta, TDropMeta, TIntent>
): DndController<TDragMeta, TDropMeta, TIntent>
```

**DndCreateOptions:**

| Field | Type | Description |
|---|---|---|
| `activationDistance?` | `number` | Pixels before drag activates (default: 6). |
| `touchActivationDelayMs?` | `number` | Delay for touch drag activation (default: 120). |
| `collisionDetector?` | `(ctx: DndCollisionContext) => DndId \| null` | Custom collision detection. Default uses pointer containment + nearest center. |
| `buildIntent?` | `(ctx: DndBuildIntentContext) => TIntent \| null` | Build custom intent (e.g. "before"/"after" for reordering). |
| `isSameIntent?` | `(a, b) => boolean` | Custom intent comparator. Default uses `===`. |
| `onDragStart?` | `(ctx: DndEventContext) => void` | Fired when drag begins. |
| `onDragOver?` | `(ctx: DndEventContext) => void` | Fired on drag movement over droppables. |
| `onDrop?` | `(ctx: DndEventContext) => void` | Fired on drop. |
| `onCancel?` | `(ctx: DndEventContext) => void` | Fired on cancel (Escape key or programmatic). |
| `announcements?` | `{ dragStart?, dragOver?, drop?, cancel? }` | ARIA live region announcement factories. |

**DndController:**

| Field | Type | Description |
|---|---|---|
| `draggable` | `(el, accessor) => void` | SolidJS directive for draggable elements. |
| `droppable` | `(el, accessor) => void` | SolidJS directive for droppable elements. |
| `activeId` | `Accessor<DndId \| null>` | Currently dragged item ID. |
| `overId` | `Accessor<DndId \| null>` | Current drop target ID. |
| `intent` | `Accessor<TIntent \| null>` | Current drop intent. |
| `isDragging` | `Accessor<boolean>` | Whether a drag is active. |
| `cancel` | `() => void` | Programmatically cancel the drag. |
| `destroy` | `() => void` | Tear down all listeners and state. |

**DndDraggableConfig:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique draggable ID. |
| `meta` | `TDragMeta` | Arbitrary metadata. |
| `disabled?` | `boolean` | Disable dragging. |
| `focusable?` | `boolean` | Auto-add to tab order (default: true). Set false if wrapping interactive elements. |
| `keyboard?` | `boolean` | Enable keyboard drag (Space/Enter to start, Arrows to move, Escape to cancel). |
| `handleSelector?` | `string` | CSS selector restricting drag start to a handle element. |

**DndDroppableConfig:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique droppable ID. |
| `meta` | `TDropMeta` | Arbitrary metadata. |
| `disabled?` | `boolean` | Disable dropping. |

Data attributes set automatically: `data-dnd-draggable`, `data-dnd-droppable`, `data-dnd-over`, `aria-grabbed`.

Ghost element: clones the source element (or its `[data-dnd-preview]` child) as a fixed-position overlay. Supports `data-dnd-count` attribute for badge rendering.

### Example

```tsx
const { draggable, droppable, isDragging, activeId, overId } = dnd.create<
  { label: string },
  { accepts: string },
  "before" | "after"
>({
  onDrop: ({ active, over, intent }) => {
    if (over) reorder(active.id, over.id, intent);
  },
  buildIntent: ({ active, over, pointer }) => {
    if (!over) return null;
    return pointer.y < over.center.y ? "before" : "after";
  },
  announcements: {
    dragStart: (active) => `Picked up ${active.meta.label}`,
    drop: (active, over) => `Dropped ${active.meta.label} on ${over?.meta.accepts ?? "nothing"}`,
  },
});

// Use as SolidJS directives
<div use:draggable={{ id: "item-1", meta: { label: "Task 1" }, keyboard: true }}>
  Drag me
</div>
<div use:droppable={{ id: "zone-a", meta: { accepts: "tasks" } }}>
  Drop here
</div>

// Use with a drag handle
<div use:draggable={{ id: "item-2", meta: { label: "Task 2" }, handleSelector: "[data-drag-handle]" }}>
  <span data-drag-handle>Grip</span>
  <span>Content</span>
</div>

// React to drag state
<div classList={{ "opacity-50": isDragging() && activeId() === "item-1" }}>
  ...
</div>
```

---

## detailPanel

URL-synced detail panel with browser history management. Designed for list/detail layouts where selecting an item opens a detail view without page reload.

### API

```ts
detailPanel.createPanel<T>(options: DetailPanelOptions<T>): DetailPanelController<T>
detailPanel.createList<T>(options: { paramName: string; eventName: string; initialKey: string | null }): {
  selectedKey: Accessor<string | null>;
  select: (item: T, key: string) => void;
  deselect: () => void;
}
detailPanel.select<T>(paramName: string, eventName: string, item: T | null, itemKey: string | null): void
detailPanel.dispatch<T>(eventName: string, item: T | null, itemKey: string | null): void
detailPanel.shouldHandleClick(event: MouseEvent, anchor?: HTMLAnchorElement | null): boolean
detailPanel.setUrlParam(paramName: string, value: string | null): void
detailPanel.getUrlParam(paramName: string): string | null
```

**DetailPanelOptions<T>:**

| Field | Type | Description |
|---|---|---|
| `paramName` | `string` | URL search parameter name. |
| `eventName` | `string` | Custom event name for cross-component sync. |
| `initialItem` | `T \| null` | SSR-provided initial item. |
| `initialKey` | `string \| null` | SSR-provided initial key. |
| `items` | `T[]` | All items for popstate lookup. |
| `getItemKey` | `(item: T) => string` | Key extractor. |

**DetailPanelController<T>:** `{ item: Accessor<T | null>; itemKey: Accessor<string | null> }`

### Example

```tsx
// Detail panel component
const { item, itemKey } = detailPanel.createPanel({
  paramName: "user",
  eventName: "user-select",
  initialItem: props.initialUser,
  initialKey: props.initialUserId,
  items: props.users,
  getItemKey: (u) => u.id,
});

return (
  <Show when={item()} fallback={<p>Select a user</p>}>
    {(user) => <UserCard user={user()} />}
  </Show>
);

// List component
const { selectedKey, select, deselect } = detailPanel.createList<User>({
  paramName: "user",
  eventName: "user-select",
  initialKey: props.selectedUserId,
});

return (
  <For each={props.users}>
    {(user) => (
      <div
        classList={{ active: selectedKey() === user.id }}
        onClick={() => select(user, user.id)}
      >
        {user.name}
      </div>
    )}
  </For>
);
```

---

## localStore

Reactive localStorage with SolidJS stores and cross-tab synchronization via BroadcastChannel.
For simple non-reactive cookie storage, see `cookies` from `@valentinkolb/stdlib/browser`.

### API

```ts
localStore.create<T extends Record<string, any>>(
  key: string,
  defaultValue: T,
  options?: { storage?: Storage; serializer?: Serializer }
): [Store<StoreItem<T>>, SetStoreFunction<StoreItem<T>>]

localStore.query<T extends Record<string, any>>(
  keysFilter?: (key: string) => boolean,
  options?: { storage?: Storage; enhanceRecord?: (item: StoreItem<T>) => StoreItem<T>; serializer?: Serializer }
): [Store<StoreItem<T>[]>, () => void]  // [stores, reload]

localStore.remove(key: string, storage?: Storage): void
localStore.modify<T>(key: string, value: T | ((prev?: T) => T), options?: { storage?: Storage; serializer?: Serializer }): void
localStore.exists(key: string, storage?: Storage): boolean
localStore.read<T>(key: string, options?: { storage?: Storage; serializer?: Serializer }): T | null
```

`StoreItem<T>` is `T & { _key: string }` -- every store item includes the localStorage key as `_key`.

The `create` function must be called inside a SolidJS reactive owner (registers `onCleanup` for the sync subscription). The `query` function also registers `onCleanup`.

Changes made via `setStore` are automatically persisted to localStorage and broadcast to other tabs. Other tabs receive the update and reactively update their stores.

### Example

```tsx
// Single record store
const [settings, setSettings] = localStore.create("app-settings", {
  theme: "light",
  fontSize: 14,
});

setSettings("theme", "dark");       // auto-persists, syncs across tabs
console.log(settings.theme);        // "dark"
console.log(settings._key);         // "app-settings"

// Query multiple keys
const [pads, reload] = localStore.query<PadData>(
  (key) => key.startsWith("pad:")
);

// Direct operations (no reactive owner needed)
localStore.modify("pad:abc", { title: "Updated" });
localStore.modify("counter", (prev) => ({ count: (prev?.count ?? 0) + 1 }));
localStore.remove("pad:abc");
const exists = localStore.exists("pad:abc");
const data = localStore.read<PadData>("pad:abc");
```

---

## clipboard

Reactive copy-to-clipboard with a timeout-based `wasCopied` feedback signal.
Wraps `clipboard.copy()` from `@valentinkolb/stdlib/browser` with a reactive signal that auto-resets.

### API

```ts
clipboard.create(timeout?: number): {
  copy: (text: string) => Promise<void>;
  wasCopied: Accessor<boolean>;
}
```

Default timeout is 2000ms. Must be called inside a SolidJS reactive owner (registers `onCleanup` for the timer). Errors from the Clipboard API are caught and logged, not thrown.

### Example

```tsx
const { copy, wasCopied } = clipboard.create(3000);

return (
  <button onClick={() => copy("Hello, world!")}>
    {wasCopied() ? "Copied!" : "Copy"}
  </button>
);
```

---

## clickOutside

Click-outside detection. Returns a ref callback to attach to the tracked element.

### API

```ts
clickOutside.create(callback: () => void): (el: HTMLElement) => void
```

Must be called inside a SolidJS component. Listens on `mousedown` (not `click`) to detect outside interaction before the target's own click handlers fire. Auto-cleanup via `onCleanup`.

### Example

```tsx
const ref = clickOutside.create(() => setOpen(false));

return (
  <Show when={open()}>
    <div ref={ref} class="dropdown">
      Dropdown content
    </div>
  </Show>
);
```

---

## dropzone

Headless file drop zone with MIME type validation. Uses a drag counter pattern for correct nested-element handling.

### API

```ts
dropzone.create(options: DropzoneOptions): {
  isDragging: () => boolean;
  invalidDrag: Accessor<boolean>;
  handlers: DropzoneHandlers;
}
```

**DropzoneOptions:**

| Field | Type | Description |
|---|---|---|
| `onDrop?` | `(files: File[]) => void` | Called with validated files on drop. |
| `accept?` | `string` | MIME filter (e.g. `"image/*"`, `"image/jpeg,image/png"`). |

**DropzoneHandlers:** `{ onDragEnter, onDragLeave, onDragOver, onDrop }` -- spread on the drop target element.

`invalidDrag` is `true` when dragged files do not match the `accept` filter.

### Example

```tsx
const { isDragging, invalidDrag, handlers } = dropzone.create({
  onDrop: (files) => uploadFiles(files),
  accept: "image/*",
});

return (
  <div
    {...handlers}
    classList={{
      "border-blue-500": isDragging() && !invalidDrag(),
      "border-red-500": isDragging() && invalidDrag(),
      "border-gray-300": !isDragging(),
    }}
  >
    {isDragging() ? (invalidDrag() ? "Invalid file type" : "Drop here") : "Drag files here"}
  </div>
);
```

---

## a11y

Accessibility utilities for non-button interactive elements.

### API

```ts
a11y.clickOrEnter(
  fn: (e: MouseEvent | KeyboardEvent) => void
): {
  onClick: JSX.EventHandler<HTMLElement, MouseEvent>;
  onKeyDown: JSX.EventHandler<HTMLElement, KeyboardEvent>;
}
```

Returns spreadable event handlers that fire `fn` on click, Enter, or Space. Both handlers call `stopPropagation`; the keyboard handler also calls `preventDefault`.

Does not require a reactive owner -- can be used anywhere.

### Example

```tsx
<div role="button" tabindex="0" {...a11y.clickOrEnter(() => doAction())}>
  Click or press Enter
</div>

// With dynamic handler
<For each={items}>
  {(item) => (
    <div role="button" tabindex="0" {...a11y.clickOrEnter(() => selectItem(item.id))}>
      {item.name}
    </div>
  )}
</For>
```
