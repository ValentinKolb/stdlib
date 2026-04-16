import { createSignal, onCleanup } from "solid-js";

// ==========================
// Reactive Clipboard
// ==========================

/**
 * Creates a reactive clipboard hook with copy feedback signal.
 *
 * Errors from the Clipboard API are caught and logged to `console.error` --
 * they are not propagated to the caller. If copying fails, `wasCopied` remains `false`.
 *
 * @param timeout - Time in ms after which wasCopied resets to false (default: 2000)
 * @returns Object with copy function and wasCopied signal
 *
 * @example
 * const { copy, wasCopied } = clipboard.create();
 * await copy("Hello");
 * console.log(wasCopied()); // true (resets after 2s)
 */
const create = (timeout: number = 2000) => {
  const [wasCopied, setWasCopied] = createSignal(false);
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      if (timerId !== null) clearTimeout(timerId);
      setWasCopied(true);
      timerId = setTimeout(() => {
        setWasCopied(false);
        timerId = null;
      }, timeout);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  onCleanup(() => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  });

  return { copy, wasCopied };
};

export const clipboard = {
  create,
} as const;
