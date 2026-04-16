import { createSignal, type Accessor } from "solid-js";

const normalizeError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

/**
 * Type for the return type of create mutation.
 *
 * @template T - The type of data returned by the mutation.
 * @template V - The type of variables passed to the mutation.
 * @template C - The base type of the context returned by the onBefore hook.
 */
type MutationResult<T, V, C = unknown> = {
  /** Signal returning the mutation data or null */
  data: Accessor<T | null>;
  /** Signal returning the error or null */
  error: Accessor<Error | null>;
  /** Signal indicating whether the mutation is in progress */
  loading: Accessor<boolean>;
  /**
   * Triggers the mutation with the given variables.
   * Returns a Promise that resolves when the mutation is complete.
   * The `onBefore` hook is executed during this call.
   */
  mutate: (vars: V) => Promise<void>;
  /**
   * Aborts the current running mutation (if any).
   * The mutation function must support cancellation via an AbortSignal passed in the context.
   */
  abort: () => void;
  /**
   * Retries the last mutation using the same arguments and base context as the previous call.
   * **Note:** The `onBefore` hook is NOT re‑executed on retry, so any one‑time side effects will not occur again.
   */
  retry: () => Promise<void>;
};

/**
 * Options for the mutation.
 *
 * @template T - The type of data returned by the mutation function.
 * @template V - The type of variables passed to the mutation function.
 * @template C - The base type of the context returned by the onBefore hook.
 */
type MutationOptions<T, V, C = unknown> = {
  /**
   * The initial value of the mutation.
   * If not provided, the mutation will start with an undefined value.
   * If provided, the initial value will be returned as the data.
   */
  initialData?: T;

  /**
   * The mutation function.
   * It receives the mutation variables and a combined context.
   * **Note:** The context will always include an `abortSignal` property.
   * Must return a Promise of type T.
   */
  mutation: (vars: V, ctx: C & { abortSignal: AbortSignal }) => Promise<T>;

  /**
   * Optional hook executed before the mutation starts.
   * It receives the mutation variables and should return a base context (ctx)
   * that will later be extended with the abort signal.
   * It can also return a Promise.
   */
  onBefore?: (vars: V) => C | Promise<C>;

  /**
   * Optional callback executed when the mutation is successful.
   * It receives the mutation result and the combined context.
   */
  onSuccess?: (data: T, ctx?: C & { abortSignal: AbortSignal }) => void;

  /**
   * Optional callback executed if an error occurs during the mutation or in onBefore.
   * It receives the error and the combined context.
   */
  onError?: (error: Error, ctx?: C & { abortSignal: AbortSignal }) => void;

  /**
   * Optional callback executed if the mutation is aborted.
   * It receives the combined context.
   * This hook is only called if the mutation was aborted with the `abort` function,
   * not if another abort signal was triggered.
   */
  onAbort?: (ctx?: C & { abortSignal: AbortSignal }) => void;

  /**
   * Optional callback executed after the mutation completes,
   * regardless of success, error, or abort.
   * This callback is called after loading is set to false.
   * It receives the combined context.
   */
  onFinally?: (ctx?: C & { abortSignal: AbortSignal }) => void;
};

/**
 * Creates a mutation controller for managing async operations with lifecycle hooks.
 *
 * Provides reactive signals for data, error, and loading states, plus `mutate`, `abort`,
 * and `retry` controls. The `retry()` method re-uses the base context from the previous
 * execution and does NOT call `onBefore` again -- use this for one-time side effects
 * that should not be repeated on retries.
 *
 * @assumption Must be called inside a SolidJS component (or reactive owner) so that
 *   signals are properly tracked and `onCleanup` handlers can be registered if needed.
 *
 * Side effects:
 * - Creates SolidJS signals for `data`, `error`, and `loading`.
 * - Allocates an `AbortController` per mutation invocation.
 *
 * @template T - The type of data returned by the mutation.
 * @template V - The type of variables passed to the mutation function.
 * @template C - The base type of the context returned by the onBefore hook.
 *
 * @param options - The options for the mutation.
 * @returns An object containing the mutation signals and functions.
 *
 * @example
 * ```tsx
 * const { data, error, loading, mutate, abort, retry } = mutation.create({
 *   mutation: async (vars, { abortSignal }) => {
 *     const res = await fetch(`/api/items`, { signal: abortSignal, method: "POST", body: JSON.stringify(vars) });
 *     return res.json();
 *   },
 *   onSuccess: (data) => console.log("Created:", data),
 *   onError: (err) => console.error("Failed:", err),
 * });
 *
 * // Trigger the mutation
 * mutate({ name: "New Item" });
 *
 * // Abort in-flight request
 * abort();
 *
 * // Retry the last mutation with the same variables
 * retry();
 * ```
 */
const create = <T, V, C = unknown>(options: MutationOptions<T, V, C>): MutationResult<T, V, C> => {
  // Create signals for data, error, and loading state.
  const [data, setData] = createSignal<T | null>(options.initialData ?? null);
  const [error, setError] = createSignal<Error | null>(null);
  const [loading, setLoading] = createSignal<boolean>(false);

  // Store the current AbortController so we can cancel the mutation.
  let currentAbortController: AbortController | null = null;

  // Optionally store the current combined context (base context merged with the abort signal).
  let currentCtx: (C & { abortSignal: AbortSignal }) | undefined;

  // Store the last mutation variables and base context to allow retrying without re‑executing onBefore.
  let lastVars: V | undefined;
  let lastBaseCtx: C | undefined;

  /**
   * Helper to update the data signal safely.
   *
   * SolidJS interprets functions passed to setters as updater functions.
   * Wrapping a function in an arrow function ensures it is stored as a literal value.
   *
   * @param value - The new data value.
   */
  const safeSetData = (value: T) => {
    if (typeof value === "function") {
      setData(() => value);
    } else {
      setData(value as Exclude<T, Function>);
    }
  };

  /**
   * Private helper that runs the mutation.
   *
   * @param vars - The mutation variables.
   * @param baseCtx - An optional base context. If provided, the onBefore hook is NOT re‑executed.
   */
  const runMutation = async (vars: V, baseCtx?: C): Promise<void> => {
    // Store the latest variables and base context (may be undefined).
    lastVars = vars;
    if (baseCtx !== undefined) {
      lastBaseCtx = baseCtx;
    }
    setLoading(true);
    setError(null);

    // Create a new AbortController for this mutation.
    // Keep local reference so concurrent runs don't interfere.
    const abortController = new AbortController();
    currentAbortController = abortController;

    // Combine the provided base context (if any) with the new abort signal.
    const combinedCtx = {
      ...(baseCtx && typeof baseCtx === "object" ? baseCtx : {}),
      abortSignal: abortController.signal,
    } as C & { abortSignal: AbortSignal };
    // Store the combined context for potential abort callbacks.
    currentCtx = combinedCtx;

    try {
      const result = await options.mutation(vars, combinedCtx);

      // If the mutation was aborted, trigger the onAbort callback.
      if (abortController.signal.aborted) {
        if (options.onAbort) {
          options.onAbort(combinedCtx);
        }
      } else {
        safeSetData(result);
        if (options.onSuccess) {
          options.onSuccess(result, combinedCtx);
        }
      }
    } catch (err: unknown) {
      if (currentAbortController !== abortController) return;
      const error = normalizeError(err);
      setError(error);
      if (options.onError) {
        options.onError(error, combinedCtx);
      }
    } finally {
      setLoading(false);
      if (options.onFinally) {
        options.onFinally(combinedCtx);
      }
      // Only clear if we're still the active mutation
      if (currentAbortController === abortController) {
        currentAbortController = null;
      }
      currentCtx = undefined;
    }
  };

  /**
   * Triggers the mutation using the provided variables.
   * This method executes the `onBefore` hook (if provided) to obtain the base context.
   *
   * @param vars - The variables to pass to the mutation function.
   */
  const mutate = async (vars: V): Promise<void> => {
    let baseCtx: C | undefined = undefined;
    try {
      if (options.onBefore) {
        baseCtx = await options.onBefore(vars);
        lastBaseCtx = baseCtx;
      }
    } catch (err: unknown) {
      const error = normalizeError(err);
      setError(error);
      // Context is undefined because onBefore failed before producing a context
      options.onError?.(error, undefined);
      options.onFinally?.(undefined);
      return;
    }
    await runMutation(vars, baseCtx);
  };

  /**
   * Aborts the currently running mutation, if any.
   * The mutation function must support cancellation via the abort signal provided in the context.
   */
  const abort = () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  };

  /**
   * Retries the last mutation using the same arguments and base context as the previous call.
   * **Note:** The onBefore hook is NOT re‑executed on retry, so any one‑time side effects will not occur again.
   */
  const retry = async (): Promise<void> => {
    if (lastVars !== undefined) {
      await runMutation(lastVars, lastBaseCtx);
    }
  };

  return { data, error, loading, mutate, abort, retry };
};

export const mutation = {
  create,
} as const;

export type { MutationResult, MutationOptions };
