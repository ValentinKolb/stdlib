import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

// =============================================================================
// Types
// =============================================================================

export type DateContext = {
  /** IANA timezone, e.g. "Europe/Berlin" or "America/New_York". */
  timeZone?: string;
  /** BCP 47 locale tag, e.g. "en", "de", "fr". */
  locale?: string;
  /** First day of week. Defaults to ISO Monday. */
  weekStartsOn?: 0 | 1;
};

export type RelativeDateContext = DateContext & {
  /** Base timestamp for relative formatting. Defaults to now. */
  base?: string | Date;
};

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

type LocaleOrContext = string | DateContext;

// =============================================================================
// Internals (helpers)
// =============================================================================

const pluralize = (value: number, unit: string): string => `${value} ${unit}${value === 1 ? "" : "s"} ago`;

const formatDurationPart = (value: number, label: string): string => `${value} ${label}${value === 1 ? "" : "s"}`;

const isContext = (value: unknown): value is DateContext =>
  typeof value === "object" && value !== null && !(value instanceof Date);

const normalizeContext = (input?: LocaleOrContext): DateContext => {
  if (typeof input === "string") return { locale: input };
  return input ?? {};
};

const asDate = (input: string | Date): Date => (typeof input === "string" ? new Date(input) : input);

const pad2 = (value: number): string => String(value).padStart(2, "0");

const contextLocale = (context: DateContext | undefined, fallback = "en"): string => context?.locale ?? fallback;

const contextTimeZone = (context: DateContext | undefined, fallback?: string): string | undefined => context?.timeZone ?? fallback;

const zoned = (input: string | Date, context?: DateContext, fallbackTimeZone?: string): dayjs.Dayjs => {
  const zone = contextTimeZone(context, fallbackTimeZone);
  const value = asDate(input);
  return zone ? dayjs(value).tz(zone) : dayjs(value);
};

const zonedNow = (context?: DateContext, fallbackTimeZone?: string): dayjs.Dayjs => {
  const zone = contextTimeZone(context, fallbackTimeZone);
  return zone ? dayjs().tz(zone) : dayjs();
};

const zonedLocalDate = (year: number, month: number, day: number, context?: DateContext): dayjs.Dayjs => {
  if (!context?.timeZone) return dayjs(new Date(year, month, day));

  // Preserve JavaScript Date overflow semantics (e.g. Jan 31 + 1 month = Mar 3)
  // before anchoring the resulting civil date in the requested timezone.
  const overflow = new Date(Date.UTC(year, month, day));
  const y = overflow.getUTCFullYear();
  const m = overflow.getUTCMonth() + 1;
  const d = overflow.getUTCDate();
  return dayjs.tz(`${y}-${pad2(m)}-${pad2(d)}`, context.timeZone);
};

const startOfZonedDay = (input: string | Date, context?: DateContext): Date => {
  if (!context?.timeZone) {
    const d = asDate(input);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return zoned(input, context).startOf("day").toDate();
};

const endOfZonedDay = (input: string | Date, context?: DateContext): Date => {
  if (!context?.timeZone) {
    const d = asDate(input);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }
  return zoned(input, context).endOf("day").toDate();
};

const weekStart = (input: string | Date, context?: DateContext): dayjs.Dayjs => {
  const d = zoned(input, context);
  const firstDay = context?.weekStartsOn ?? 1;
  const diff = (d.day() - firstDay + 7) % 7;
  const start = d.subtract(diff, "day");
  return zonedLocalDate(start.year(), start.month(), start.date(), context);
};

const weekEnd = (input: string | Date, context?: DateContext): Date => {
  const start = weekStart(input, context);
  const end = zonedLocalDate(start.year(), start.month(), start.date() + 6, context).endOf("day");
  return end.toDate();
};

const intlParts = (
  input: string | Date,
  context: DateContext | undefined,
  fallbackTimeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> => {
  const formatter = new Intl.DateTimeFormat(contextLocale(context), {
    ...options,
    timeZone: contextTimeZone(context, fallbackTimeZone),
  });
  const result: Record<string, string> = {};
  for (const part of formatter.formatToParts(asDate(input))) {
    if (part.type !== "literal") result[part.type] = part.value;
  }
  return result;
};

const monthName = (input: string | Date, context?: DateContext, width: "short" | "long" = "long", fallbackTimeZone?: string): string =>
  new Intl.DateTimeFormat(contextLocale(context), {
    month: width,
    timeZone: contextTimeZone(context, fallbackTimeZone),
  }).format(asDate(input));

const weekdayName = (input: string | Date, context?: DateContext, width: "short" | "long" = "short", fallbackTimeZone?: string): string =>
  new Intl.DateTimeFormat(contextLocale(context), {
    weekday: width,
    timeZone: contextTimeZone(context, fallbackTimeZone),
  }).format(asDate(input));

const sameZonedDay = (a: string | Date, b: string | Date, context?: DateContext, fallbackTimeZone?: string): boolean => {
  const da = zoned(a, context, fallbackTimeZone);
  const db = zoned(b, context, fallbackTimeZone);
  return da.year() === db.year() && da.month() === db.month() && da.date() === db.date();
};

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a date as `"05 Mar 2025"`.
 *
 * Defaults to UTC for backward compatibility. Pass `timeZone` to format the
 * same instant in an explicit IANA timezone.
 */
export const formatDate = (input: string | Date, context?: DateContext): string => {
  const parts = intlParts(input, context, "UTC", { day: "2-digit", month: "short", year: "numeric" });
  return `${parts.day} ${parts.month} ${parts.year}`;
};

/**
 * Format a date and time as `"05 Mar 2025, 13:53"`.
 *
 * Defaults to UTC for backward compatibility. Pass `timeZone` to format the
 * same instant in an explicit IANA timezone.
 */
export const formatDateTime = (input: string | Date, context?: DateContext): string => {
  const d = zoned(input, context, "UTC");
  return `${formatDate(input, context)}, ${pad2(d.hour())}:${pad2(d.minute())}`;
};

/**
 * Format a date/time as a human-friendly relative string.
 *
 * Time arithmetic uses absolute milliseconds. Day labels and fallback absolute
 * dates are rendered in the requested timezone, defaulting to UTC.
 */
export const formatDateTimeRelative = (input: string | Date, context?: RelativeDateContext): string => {
  const d = asDate(input);
  const base = context?.base ? asDate(context.base) : new Date();
  const diffMs = base.getTime() - d.getTime();

  if (diffMs < 0) return formatDate(d, context);
  if (diffMs < 5_000) return "just now";
  if (diffMs < 60_000) return pluralize(Math.max(1, Math.floor(diffMs / 1_000)), "sec");
  if (diffMs < 60 * 60 * 1000) return pluralize(Math.max(1, Math.floor(diffMs / (60 * 1000))), "min");
  if (diffMs < 24 * 60 * 60 * 1000) return pluralize(Math.max(1, Math.floor(diffMs / (60 * 60 * 1000))), "hour");
  if (diffMs < 48 * 60 * 60 * 1000) return "Yesterday";
  if (diffMs < 7 * 24 * 60 * 60 * 1000) return weekdayName(d, context, "short", "UTC");
  return formatDate(d, context);
};

/**
 * Format a date relative to now with day-level granularity.
 *
 * Day boundaries are evaluated in the requested timezone, defaulting to UTC
 * for backward compatibility.
 */
export const formatDateRelative = (input: string | Date, context?: RelativeDateContext): string => {
  const d = asDate(input);
  const base = context?.base ? asDate(context.base) : new Date();
  if (d.getTime() > base.getTime()) return formatDate(d, context);

  const todayStart = zoned(base, context, "UTC").startOf("day");
  const dateDay = zoned(d, context, "UTC").startOf("day");
  const diffDays = todayStart.diff(dateDay, "day");

  if (diffDays === 0) {
    const time = zoned(d, context, "UTC");
    return `${pad2(time.hour())}:${pad2(time.minute())}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return weekdayName(d, context, "short", "UTC");
  return formatDate(d, context);
};

/**
 * Format a timestamp relative to a base time using `Intl.RelativeTimeFormat`.
 *
 * Timezone does not affect elapsed time, but `locale` controls the wording.
 */
export const formatTimeSpan = (
  input: string | Date,
  baseOrContext: string | Date | DateContext = new Date(),
  context?: DateContext,
): string => {
  const ctx = isContext(baseOrContext) ? baseOrContext : context;
  const base = isContext(baseOrContext) ? new Date() : baseOrContext;
  const target = asDate(input);
  const origin = asDate(base);
  const diffMs = target.getTime() - origin.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const rtf = new Intl.RelativeTimeFormat(ctx?.locale, { numeric: "auto" });

  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (absMs < week) return rtf.format(Math.round(diffMs / day), "day");
  return rtf.format(Math.round(diffMs / week), "week");
};

/**
 * Format an absolute duration between two timestamps as a human-readable string.
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

export const formatMonthYear = (date: Date, localeOrContext?: LocaleOrContext): string => {
  const context = normalizeContext(localeOrContext);
  const z = zoned(date, context);
  return `${monthName(date, context, "long")} ${z.year()}`;
};

export const formatDayNumber = (date: Date, context?: DateContext): string => String(zoned(date, context).date());

export const formatWeekdayShort = (date: Date, localeOrContext?: LocaleOrContext): string =>
  weekdayName(date, normalizeContext(localeOrContext), "short").slice(0, 2);

export const formatWeekdayLong = (date: Date, localeOrContext?: LocaleOrContext): string =>
  weekdayName(date, normalizeContext(localeOrContext), "long");

export const formatFullDate = (date: Date, localeOrContext?: LocaleOrContext): string => {
  const context = normalizeContext(localeOrContext);
  const z = zoned(date, context);
  return `${z.date()}. ${monthName(date, context, "long")} ${z.year()}`;
};

export const formatDateShort = (date: Date, context?: DateContext): string => {
  const z = zoned(date, context);
  return `${z.date()}.${z.month() + 1}.`;
};

export const formatDateKey = (date: Date, context?: DateContext): string => {
  const z = zoned(date, context);
  return `${z.year()}-${pad2(z.month() + 1)}-${pad2(z.date())}`;
};

export const formatTime = (input: string | Date, context?: DateContext): string => {
  const d = zoned(input, context);
  return `${pad2(d.hour())}:${pad2(d.minute())}`;
};

// =============================================================================
// Comparison
// =============================================================================

export const isToday = (date: Date, context?: DateContext): boolean => sameZonedDay(date, new Date(), context);

export const isSameMonth = (date: Date, refDate: Date, context?: DateContext): boolean => {
  const a = zoned(date, context);
  const b = zoned(refDate, context);
  return a.year() === b.year() && a.month() === b.month();
};

export const isSameDay = (a: Date, b: Date, context?: DateContext): boolean => sameZonedDay(a, b, context);

// =============================================================================
// Arithmetic & Navigation
// =============================================================================

export const addMonths = (date: Date, n: number, context?: DateContext): Date => {
  if (!context?.timeZone) return new Date(date.getFullYear(), date.getMonth() + n, date.getDate());
  const z = zoned(date, context);
  return zonedLocalDate(z.year(), z.month() + n, z.date(), context).toDate();
};

export const addWeeks = (date: Date, n: number, context?: DateContext): Date => addDays(date, n * 7, context);

export const addDays = (date: Date, n: number, context?: DateContext): Date => {
  if (!context?.timeZone) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  const z = zoned(date, context);
  return zonedLocalDate(z.year(), z.month(), z.date() + n, context).toDate();
};

export const startOfMonth = (date: Date, context?: DateContext): Date => {
  if (!context?.timeZone) return new Date(date.getFullYear(), date.getMonth(), 1);
  const z = zoned(date, context);
  return zonedLocalDate(z.year(), z.month(), 1, context).toDate();
};

export const startOfWeek = (date: Date, context?: DateContext): Date => weekStart(date, context).toDate();

export const today = (context?: DateContext): Date => startOfZonedDay(new Date(), context);

// =============================================================================
// Calendar Views
// =============================================================================

export const getMonthGrid = (year: number, month: number, context?: DateContext): Date[][] => {
  const first = zonedLocalDate(year, month, 1, context);
  const start = weekStart(first.toDate(), context);

  const weeks: Date[][] = [];
  let current = start;

  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) =>
      zonedLocalDate(current.year(), current.month(), current.date() + d, context).toDate(),
    );
    weeks.push(week);
    current = zonedLocalDate(current.year(), current.month(), current.date() + 7, context);

    if (current.month() !== month && w >= 3) break;
  }

  return weeks;
};

export const getWeekDays = (date: Date, context?: DateContext): Date[] => {
  const start = weekStart(date, context);
  return Array.from({ length: 7 }, (_, i) =>
    zonedLocalDate(start.year(), start.month(), start.date() + i, context).toDate(),
  );
};

export const getDateRange = (view: "month" | "week", date: Date, context?: DateContext): { from: Date; to: Date } => {
  if (view === "month") {
    const z = zoned(date, context);
    const first = zonedLocalDate(z.year(), z.month(), 1, context);
    const last = zonedLocalDate(z.year(), z.month() + 1, 0, context);
    return { from: weekStart(first.toDate(), context).toDate(), to: weekEnd(last.toDate(), context) };
  }

  return { from: weekStart(date, context).toDate(), to: weekEnd(date, context) };
};

// =============================================================================
// Calendar Item Filtering
// =============================================================================

export const itemOnDate = (item: CalendarItemLike, date: Date, context?: DateContext): boolean => {
  const dayStart = startOfZonedDay(date, context);
  const dayEnd = endOfZonedDay(date, context);

  if (item.startsAt && item.endsAt) {
    const start = asDate(item.startsAt);
    const end = asDate(item.endsAt);
    return start.getTime() < dayEnd.getTime() && end.getTime() > dayStart.getTime();
  }

  if (item.deadline) return sameZonedDay(item.deadline, date, context);

  return false;
};

export const getDayItems = <T extends CalendarItemLike>(items: T[], date: Date, context?: DateContext): T[] =>
  items.filter((item) => itemOnDate(item, date, context));

// =============================================================================
// Constants & Generators
// =============================================================================

export const weekdays = (localeOrContext?: LocaleOrContext): string[] => {
  const context = normalizeContext(localeOrContext);
  return Array.from({ length: 7 }, (_, i) => {
    const d = zonedLocalDate(2024, 0, i + 1, context).toDate();
    return weekdayName(d, context, "short");
  });
};

export const months = (localeOrContext?: LocaleOrContext): string[] => {
  const context = normalizeContext(localeOrContext);
  return Array.from({ length: 12 }, (_, i) => {
    const d = zonedLocalDate(2024, i, 1, context).toDate();
    return monthName(d, context, "long");
  });
};

export const getYearOptions = (context?: DateContext): number[] => {
  const current = zonedNow(context).year();
  return Array.from({ length: 11 }, (_, i) => current - 5 + i);
};

// =============================================================================
// URL Helpers
// =============================================================================

export const buildCalendarUrl = (baseUrl: string, params: CalendarUrlParams, context?: DateContext): string => {
  const [path, query] = baseUrl.split("?");
  const searchParams = new URLSearchParams(query ?? "");

  searchParams.set("view", "calendar");

  if (params.view) searchParams.set("cv", params.view);
  else searchParams.delete("cv");

  if (params.date) searchParams.set("cd", formatDateKey(params.date, context));
  else searchParams.delete("cd");

  if (params.item) searchParams.set("item", params.item);
  else searchParams.delete("item");

  return `${path}?${searchParams.toString()}`;
};

export const parseCalendarDate = (param: string | undefined, context?: DateContext): Date => {
  if (!param) return today(context);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (match) {
    const [, y, m, d] = match;
    const date = zonedLocalDate(Number(y), Number(m) - 1, Number(d), context);
    if (date.isValid()) return date.toDate();
  }

  const lenient = asDate(param);
  if (!isNaN(lenient.getTime())) return startOfZonedDay(lenient, context);
  return today(context);
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
