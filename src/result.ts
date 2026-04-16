// ==========================
// Core Result Types
// ==========================

/**
 * Union of recognized service error codes.
 *
 * Each code maps to a specific HTTP status:
 * - `"BAD_INPUT"` -- 400
 * - `"UNAUTHENTICATED"` -- 401
 * - `"FORBIDDEN"` -- 403
 * - `"NOT_FOUND"` -- 404
 * - `"CONFLICT"` -- 409
 * - `"INTERNAL"` -- 500
 */
export type ServiceErrorCode = "BAD_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

/**
 * Structured service error with a machine-readable code, human-readable
 * message, and corresponding HTTP status code.
 *
 * @typeParam C - The error code string literal (defaults to `string`)
 */
export type ServiceError<C extends string = string> = {
  code: C;
  message: string;
  status: 400 | 401 | 403 | 404 | 409 | 500;
};

export type Result<T = void, E extends ServiceError = ServiceError> = { ok: true; data: T } | { ok: false; error: E };

export type PageParams = {
  page?: number;
  perPage?: number;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  hasNext: boolean;
};

// ==========================
// Constructors
// ==========================

/**
 * Builds a successful service result.
 *
 * When called with no arguments, produces `Result<void>` with `data: undefined`.
 * When called with a value, wraps it as `Result<T>`.
 *
 * @example
 * ok()          // { ok: true, data: undefined }
 * ok({ id: 1 }) // { ok: true, data: { id: 1 } }
 */
export function ok(): Result<void, never>;
export function ok<T>(data: T): Result<T, never>;
export function ok(data?: unknown): Result<unknown, never> {
  return { ok: true, data: arguments.length === 0 ? undefined : data };
}

/**
 * Builds a successful paginated result.
 *
 * Wraps an array of items together with pagination metadata. The `hasNext`
 * flag is calculated as `page * perPage < total`.
 *
 * @param items - The page of results
 * @param info - Pagination metadata (current page, perPage, total count)
 * @returns A successful `Result` containing a {@link Paginated} payload
 */
export const okMany = <T>(items: T[], info: { page: number; perPage: number; total: number }): Result<Paginated<T>, never> => ({
  ok: true,
  data: {
    items,
    ...info,
    hasNext: info.page * info.perPage < info.total,
  },
});

/**
 * Builds a failed service result wrapping a {@link ServiceError}.
 *
 * @param error - The service error to wrap
 * @returns A failed `Result` containing the error
 */
export const fail = <E extends ServiceError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

// ==========================
// Error Helpers
// ==========================

/**
 * Factory functions for creating {@link ServiceError} objects.
 *
 * Each factory pre-fills the `code` and `status` fields, requiring only
 * a human-readable message (or subject noun for `notFound` / `conflict`).
 */
export const err = {
  /** Creates a 400 BAD_INPUT error. @param why - Reason the input is invalid */
  badInput: (why: string) =>
    ({
      code: "BAD_INPUT" as const,
      message: why,
      status: 400 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
  /** Creates a 401 UNAUTHENTICATED error. @param why - Optional reason (defaults to `"Authentication required"`) */
  unauthenticated: (why = "Authentication required") =>
    ({
      code: "UNAUTHENTICATED" as const,
      message: why,
      status: 401 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
  /** Creates a 403 FORBIDDEN error. @param why - Optional reason (defaults to `"Insufficient permissions"`) */
  forbidden: (why = "Insufficient permissions") =>
    ({
      code: "FORBIDDEN" as const,
      message: why,
      status: 403 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
  /** Creates a 404 NOT_FOUND error. Message becomes `"<what> not found"`. @param what - The entity that was not found */
  notFound: (what: string) =>
    ({
      code: "NOT_FOUND" as const,
      message: `${what} not found`,
      status: 404 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
  /** Creates a 409 CONFLICT error. Message becomes `"<what> already exists"`. @param what - The conflicting entity */
  conflict: (what: string) =>
    ({
      code: "CONFLICT" as const,
      message: `${what} already exists`,
      status: 409 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
  /** Creates a 500 INTERNAL error. @param why - Optional reason (defaults to `"Internal server error"`) */
  internal: (why = "Internal server error") =>
    ({
      code: "INTERNAL" as const,
      message: why,
      status: 500 as const,
    }) satisfies ServiceError<ServiceErrorCode>,
};

// ==========================
// Helpers
// ==========================

/**
 * Normalizes pagination input and computes a stable offset for DB queries.
 *
 * Both `page` and `perPage` are clamped to a minimum of `1`.
 * The offset is calculated as `(page - 1) * perPage`.
 *
 * @param params - Optional page/perPage values (defaults to page 1, 20 per page)
 * @returns Object with normalized `page`, `perPage`, and computed `offset`
 */
export const paginate = (params?: PageParams) => {
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, params?.perPage ?? 20);
  return { page, perPage, offset: (page - 1) * perPage };
};

/**
 * Extracts the data from a successful `Result`, or throws on failure.
 *
 * When the result is not `ok`, throws an `Error` whose message is set to
 * the `ServiceError.message` and whose properties include the `code` and
 * `status` from the error (via `Object.assign`).
 *
 * @param result - The result to unwrap
 * @returns The unwrapped data of type `T`
 * @throws {Error} With `code` and `status` properties from the `ServiceError`
 */
export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    const err = new Error(result.error.message);
    Object.assign(err, result.error);
    throw err;
  }
  return result.data;
};

/**
 * Type guard that checks whether an unknown value conforms to the
 * {@link ServiceError} shape (`code: string`, `message: string`,
 * `status: number`).
 *
 * Useful for catching errors that may already be structured service
 * errors (e.g. re-thrown from inner service calls).
 *
 * @param value - The value to test
 * @returns `true` if `value` is a `ServiceError`
 */
export const isServiceError = (value: unknown): value is ServiceError => {
  if (typeof value !== "object" || value === null) return false;
  const e = value as { code?: unknown; message?: unknown; status?: unknown };
  return typeof e.code === "string" && typeof e.message === "string" && typeof e.status === "number";
};

/**
 * Wraps an async function in a try/catch and returns a `Result`.
 *
 * On success, returns `ok(value)`. On failure:
 * 1. If the caught error is already a `ServiceError`, it is wrapped with `fail()`.
 * 2. Otherwise, the optional `onError` mapper is called; if omitted, an
 *    `err.internal()` is created from the error message.
 *
 * This function never throws.
 *
 * @param fn - Async function to execute
 * @param onError - Optional mapper from unknown error to `ServiceError`
 * @returns A `Result<T>` that is always settled (never rejects)
 */
export const tryCatch = async <T>(fn: () => Promise<T>, onError?: (error: unknown) => ServiceError): Promise<Result<T>> => {
  try {
    return ok(await fn());
  } catch (error) {
    if (isServiceError(error)) return fail(error);
    const mapped = onError?.(error) ?? err.internal(error instanceof Error ? error.message : String(error));
    return fail(mapped);
  }
};
