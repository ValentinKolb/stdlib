// =============================================================================
// Types
// =============================================================================

export type CalendarItemLike = {
  startsAt: string | null;
  endsAt: string | null;
  deadline: string | null;
};

export type CalendarUrlParams = {
  view?: "month" | "week";
  date?: Date;
  item?: string;
};

// =============================================================================
// Internals (helpers)
// =============================================================================

const pluralize = (value: number, unit: string): string => `${value} ${unit}${value === 1 ? "" : "s"} ago`;

const formatDurationPart = (value: number, label: string): string => `${value} ${label}${value === 1 ? "" : "s"}`;

/**
 * Coerce a string or `Date` input into a `Date` object.
 * If the input is already a `Date`, it is returned as-is.
 */
const asDate = (input: string | Date): Date => (typeof input === "string" ? new Date(input) : input);

/** Return midnight of the same calendar day (local time). */
const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Return 23:59:59.999 of the same calendar day (local time). */
const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Return the Monday (ISO week start) of the week containing `d`. */
const isoWeekStart = (d: Date): Date => {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
};

/** Return Sunday 23:59:59.999 (ISO week end) of the week containing `d`. */
const isoWeekEnd = (d: Date): Date => {
  const mon = isoWeekStart(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 23, 59, 59, 999);
};

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a date as `"05 Mar 2025"` using UTC components.
 *
 * All date parts (day, month, year) are extracted via UTC methods so the
 * result is timezone-independent.
 */
export const formatDate = (input: string | Date): string => {
  const d = asDate(input);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(d);
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
};

/**
 * Format a date and time as `"05 Mar 2025, 13:53"` using UTC components.
 *
 * Combines {@link formatDate} with the UTC hours and minutes.
 */
export const formatDateTime = (input: string | Date): string => {
  const d = asDate(input);
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hours}:${minutes}`;
};

/**
 * Format a date/time as a human-friendly relative string.
 *
 * Uses progressively coarser buckets based on how far in the past the date is:
 * - **< 5 seconds**: `"just now"`
 * - **< 1 minute**: `"12 secs ago"`
 * - **< 1 hour**: `"4 mins ago"`
 * - **< 24 hours**: `"2 hours ago"`
 * - **< 48 hours**: `"Yesterday"`
 * - **< 7 days**: weekday name (e.g. `"Mon"`) looked up via UTC day-of-week
 * - **>= 7 days** or future dates: falls back to {@link formatDate} (UTC).
 *
 * All time arithmetic is based on millisecond difference; the weekday label
 * uses UTC for consistency with the rest of the UTC-based pipeline.
 */
export const formatDateTimeRelative = (input: string | Date): string => {
  const d = asDate(input);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) return formatDate(d);
  if (diffMs < 5_000) return "just now";
  if (diffMs < 60_000) return pluralize(Math.max(1, Math.floor(diffMs / 1_000)), "sec");
  if (diffMs < 60 * 60 * 1000) return pluralize(Math.max(1, Math.floor(diffMs / (60 * 1000))), "min");
  if (diffMs < 24 * 60 * 60 * 1000) return pluralize(Math.max(1, Math.floor(diffMs / (60 * 60 * 1000))), "hour");
  if (diffMs < 48 * 60 * 60 * 1000) return "Yesterday";
  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(d);
  }
  return formatDate(d);
};

/**
 * Format a date relative to now with day-level granularity.
 *
 * - **Today**: UTC time as `"HH:MM"` (e.g. `"14:30"`)
 * - **Yesterday**: `"Yesterday"`
 * - **Within 7 days**: three-letter UTC weekday (e.g. `"Mon"`)
 * - **Older / future**: falls back to {@link formatDate} (UTC)
 *
 * Day boundaries are computed in UTC so the result is timezone-independent.
 */
export const formatDateRelative = (input: string | Date): string => {
  const d = asDate(input);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return formatDate(d);

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diffDays = Math.floor((todayStart.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  if (diffDays === 1) return "Yesterday";

  if (diffDays < 7) {
    return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(d);
  }

  return formatDate(d);
};

/**
 * Format a timestamp relative to a base time using `Intl.RelativeTimeFormat`.
 *
 * Produces locale-aware strings like `"in 3 days"` or `"2 hours ago"`.
 * The unit is chosen automatically based on the absolute difference:
 * - **< 1 hour** -- minutes
 * - **< 1 day** -- hours
 * - **< 1 week** -- days
 * - **>= 1 week** -- weeks
 */
export const formatTimeSpan = (input: string | Date, base: string | Date = new Date()): string => {
  const target = asDate(input);
  const origin = asDate(base);
  const diffMs = target.getTime() - origin.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (absMs < week) return rtf.format(Math.round(diffMs / day), "day");
  return rtf.format(Math.round(diffMs / week), "week");
};

/**
 * Format an absolute duration between two timestamps as a human-readable string.
 *
 * The result is order-agnostic -- `formatDuration(a, b)` and `formatDuration(b, a)`
 * produce the same output because `Math.abs` is used internally.
 *
 * Output examples: `"less than a minute"`, `"2 hours"`, `"1 day 3 hours"`.
 * At most two units are shown (days + hours, or hours + minutes).
 */
export const formatDuration = (from: string | Date, to: string | Date): string => {
  const start = asDate(from);
  const end = asDate(to);
  const diffMs = Math.abs(end.getTime() - start.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "less than a minute";

  const days = Math.floor(diffMs / day);
  const hours = Math.floor((diffMs % day) / hour);
  const minutes = Math.floor((diffMs % hour) / minute);

  if (days > 0) {
    return [formatDurationPart(days, "day"), hours > 0 ? formatDurationPart(hours, "hour") : null].filter(Boolean).join(" ");
  }
  if (hours > 0) {
    return [formatDurationPart(hours, "hour"), minutes > 0 ? formatDurationPart(minutes, "minute") : null].filter(Boolean).join(" ");
  }
  return formatDurationPart(minutes, "minute");
};

/**
 * Format a date as its full month name and year, e.g. `"March 2025"`.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 */
export const formatMonthYear = (date: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale ?? "en", { month: "long", year: "numeric" }).format(date);

/**
 * Format a date as its day-of-month number without leading zeros, e.g. `"9"`.
 */
export const formatDayNumber = (date: Date): string => String(date.getDate());

/**
 * Format a date as its two-letter weekday abbreviation, e.g. `"Mo"`, `"Tu"`.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 */
export const formatWeekdayShort = (date: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale ?? "en", { weekday: "short" }).format(date).slice(0, 2);

/**
 * Format a date as its full weekday name, e.g. `"Wednesday"`.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 */
export const formatWeekdayLong = (date: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale ?? "en", { weekday: "long" }).format(date);

/**
 * Format a date in long European style, e.g. `"9. March 2025"`.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 */
export const formatFullDate = (date: Date, locale?: string): string => {
  const day = date.getDate();
  const month = new Intl.DateTimeFormat(locale ?? "en", { month: "long" }).format(date);
  const year = date.getFullYear();
  return `${day}. ${month} ${year}`;
};

/**
 * Format a date as a short day.month string, e.g. `"9.3."`.
 */
export const formatDateShort = (date: Date): string => `${date.getDate()}.${date.getMonth() + 1}.`;

/**
 * Format a date as an ISO-style `YYYY-MM-DD` key string.
 * Useful for weather lookups, map keys, and other date-indexed data.
 */
export const formatDateKey = (date: Date): string => {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Format an ISO date-time string to a local `HH:mm` time string (24-hour).
 */
export const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

// =============================================================================
// Comparison
// =============================================================================

/**
 * Check whether a date is today (local time, day-level precision).
 */
export const isToday = (date: Date): boolean => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

/**
 * Check whether two dates fall in the same calendar month and year (local time).
 */
export const isSameMonth = (date: Date, refDate: Date): boolean =>
  date.getFullYear() === refDate.getFullYear() && date.getMonth() === refDate.getMonth();

/**
 * Check whether two dates fall on the same calendar day (local time).
 */
export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// =============================================================================
// Arithmetic & Navigation
// =============================================================================

/**
 * Add (or subtract) a number of months from a date.
 * Day-of-month overflow is handled natively by `Date` (e.g. Jan 31 + 1 month = Mar 3).
 */
export const addMonths = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth() + n, date.getDate());

/**
 * Add (or subtract) a number of weeks from a date.
 */
export const addWeeks = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n * 7);

/**
 * Add (or subtract) a number of days from a date.
 */
export const addDays = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * Get the first day of the month containing the given date (midnight local time).
 */
export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * Get the Monday (ISO week start) of the week containing the given date.
 */
export const startOfWeek = (date: Date): Date => isoWeekStart(date);

/**
 * Get today's date at the start of the day (midnight local time).
 */
export const today = (): Date => startOfDay(new Date());

// =============================================================================
// Calendar Views
// =============================================================================

/**
 * Build a month grid of dates suitable for rendering a calendar view.
 *
 * The grid always starts on the ISO-week Monday before (or on) the first day
 * of the given month and contains complete 7-day rows. Rows from adjacent
 * months are included as padding so every week is full. The result contains
 * between 4 and 6 week-rows depending on how the month falls.
 *
 * @example
 * const weeks = getMonthGrid(2025, 0); // January 2025
 * // weeks.length is 5 (4-6 depending on month)
 * // weeks[0].length is always 7
 */
export const getMonthGrid = (year: number, month: number): Date[][] => {
  const first = new Date(year, month, 1);
  const start = isoWeekStart(first);

  const weeks: Date[][] = [];
  let current = start;

  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => {
      return new Date(current.getFullYear(), current.getMonth(), current.getDate() + d);
    });
    weeks.push(week);
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);

    // Stop early if we've filled the month
    if (current.getMonth() !== month && w >= 3) break;
  }

  return weeks;
};

/**
 * Get the 7 days of the ISO week (Monday-first) that contains the given date.
 *
 * @example
 * const days = getWeekDays(new Date("2025-03-12")); // Wed
 * // days[0] is Monday 2025-03-10
 * // days[6] is Sunday 2025-03-16
 */
export const getWeekDays = (date: Date): Date[] => {
  const start = isoWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
};

/**
 * Compute the start and end dates needed to fetch calendar items for a view.
 *
 * - **month**: spans from the Monday of the first ISO week through the Sunday
 *   of the last ISO week, covering all padding days shown in the grid.
 * - **week**: spans a single ISO week (Monday through Sunday).
 */
export const getDateRange = (view: "month" | "week", date: Date): { from: Date; to: Date } => {
  if (view === "month") {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { from: isoWeekStart(first), to: isoWeekEnd(lastDay) };
  }

  // week
  return { from: isoWeekStart(date), to: isoWeekEnd(date) };
};

// =============================================================================
// Calendar Item Filtering
// =============================================================================

/**
 * Determine whether a calendar item falls on a specific date.
 *
 * The check uses two strategies in priority order:
 * 1. If the item has both `startsAt` and `endsAt`, the item is considered
 *    "on" the date when its time range overlaps with any part of that day.
 * 2. Otherwise, if the item has a `deadline`, it matches when the deadline
 *    falls on the same calendar day.
 * 3. If neither condition is met the function returns `false`.
 *
 * All comparisons use local time.
 */
export const itemOnDate = (item: CalendarItemLike, date: Date): boolean => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Event with time range
  if (item.startsAt && item.endsAt) {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    return start.getTime() < dayEnd.getTime() && end.getTime() > dayStart.getTime();
  }

  // Task with deadline
  if (item.deadline) {
    const dl = new Date(item.deadline);
    return dl.getFullYear() === date.getFullYear() && dl.getMonth() === date.getMonth() && dl.getDate() === date.getDate();
  }

  return false;
};

/**
 * Filter an array of calendar items to only those that fall on a given date.
 * Delegates to {@link itemOnDate} for the per-item check.
 */
export const getDayItems = <T extends CalendarItemLike>(items: T[], date: Date): T[] => items.filter((item) => itemOnDate(item, date));

// =============================================================================
// Constants & Generators
// =============================================================================

/**
 * Generate locale-aware weekday names in ISO order (Monday-first).
 * Uses 2024-01-01 (a Monday) as the reference date.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 * @returns An array of 7 short weekday names, e.g. `["Mon", "Tue", ...]`.
 */
export const weekdays = (locale?: string): string[] =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i + 1); // 2024-01-01 is Monday
    return new Intl.DateTimeFormat(locale ?? "en", { weekday: "short" }).format(d);
  });

/**
 * Generate locale-aware month names.
 *
 * @param locale - BCP 47 locale tag (default: `"en"`). Examples: `"de"`, `"fr"`, `"ja"`.
 * @returns An array of 12 long month names, e.g. `["January", "February", ...]`.
 */
export const months = (locale?: string): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2024, i, 1);
    return new Intl.DateTimeFormat(locale ?? "en", { month: "long" }).format(d);
  });

/**
 * Generate an array of year numbers for a dropdown selector.
 * Returns 11 values centered on the current year (current year +/- 5).
 */
export const getYearOptions = (): number[] => {
  const current = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, i) => current - 5 + i);
};

// =============================================================================
// URL Helpers
// =============================================================================

/**
 * Build a calendar URL by merging calendar-specific query parameters into a base URL.
 *
 * Always sets `view=calendar`. Additionally sets `cv` (calendar view), `cd` (calendar date
 * as `YYYY-MM-DD`), and `item` when the corresponding fields in `params` are provided.
 * Parameters that are `undefined` are removed from the resulting URL.
 *
 * Existing query parameters on `baseUrl` are preserved unless overridden.
 */
export const buildCalendarUrl = (baseUrl: string, params: CalendarUrlParams): string => {
  const [path, query] = baseUrl.split("?");
  const searchParams = new URLSearchParams(query ?? "");

  searchParams.set("view", "calendar");

  if (params.view) {
    searchParams.set("cv", params.view);
  } else {
    searchParams.delete("cv");
  }

  if (params.date) {
    searchParams.set("cd", formatDateKey(params.date));
  } else {
    searchParams.delete("cd");
  }

  if (params.item) {
    searchParams.set("item", params.item);
  } else {
    searchParams.delete("item");
  }

  return `${path}?${searchParams.toString()}`;
};

/**
 * Parse a `YYYY-MM-DD` date string from a URL query parameter into a `Date`.
 * Returns today's date (via {@link today}) when the parameter is missing or invalid.
 */
export const parseCalendarDate = (param: string | undefined): Date => {
  if (!param) return today();
  const parsed = new Date(param);
  return !isNaN(parsed.getTime()) ? parsed : today();
};

// =============================================================================
// Namespace Export
// =============================================================================

export const dates = {
  // Formatting
  formatDate,
  formatDateTime,
  formatDateTimeRelative,
  formatDateRelative,
  formatTimeSpan,
  formatDuration,
  formatMonthYear,
  formatDayNumber,
  formatWeekdayShort,
  formatWeekdayLong,
  formatFullDate,
  formatDateShort,
  formatDateKey,
  formatTime,
  // Comparison
  isToday,
  isSameMonth,
  isSameDay,
  // Arithmetic
  addMonths,
  addWeeks,
  addDays,
  startOfMonth,
  startOfWeek,
  today,
  // Calendar views
  getMonthGrid,
  getWeekDays,
  getDateRange,
  itemOnDate,
  getDayItems,
  // Constants & generators
  weekdays,
  months,
  getYearOptions,
  // URL helpers
  buildCalendarUrl,
  parseCalendarDate,
} as const;
