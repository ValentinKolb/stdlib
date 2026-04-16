import { describe, it, expect, beforeAll, afterAll, jest } from "bun:test";
import {
  dates,
  formatDate,
  formatDateTime,
  formatDateTimeRelative,
  formatDateRelative,
  formatTimeSpan,
  formatDuration,
} from "./dates";

const {
  getMonthGrid,
  getWeekDays,
  getDateRange,
  itemOnDate,
  getDayItems,
  isToday,
  isSameMonth,
  isSameDay,
  formatMonthYear,
  formatDayNumber,
  formatWeekdayShort,
  formatFullDate,
  formatDateKey,
  formatTime,
  addMonths,
  addWeeks,
  addDays,
  startOfMonth,
  startOfWeek,
  buildCalendarUrl,
  parseCalendarDate,
  today,
  weekdays,
  months,
} = dates;

// =============================================================================
// Pure formatters (no mocking needed)
// =============================================================================

describe("formatDate", () => {
  it("formats UTC date as 'DD Mon YYYY'", () => {
    expect(formatDate("2025-03-05T13:53:00Z")).toBe("05 Mar 2025");
  });

  it("handles Date object input", () => {
    expect(formatDate(new Date("2025-01-01T00:00:00Z"))).toBe("01 Jan 2025");
  });

  it("pads single-digit day", () => {
    expect(formatDate("2025-03-01T00:00:00Z")).toBe("01 Mar 2025");
  });

  it("uses UTC month (not local)", () => {
    expect(formatDate("2025-12-31T23:59:59Z")).toBe("31 Dec 2025");
  });
});

describe("formatDateTime", () => {
  it("appends UTC hours:minutes", () => {
    expect(formatDateTime("2025-03-05T13:53:00Z")).toBe("05 Mar 2025, 13:53");
  });

  it("pads single-digit hours and minutes", () => {
    expect(formatDateTime("2025-01-01T03:05:00Z")).toBe("01 Jan 2025, 03:05");
  });
});

// =============================================================================
// Relative formatters (need fake time)
// =============================================================================

describe("formatDateTimeRelative", () => {
  const NOW = new Date("2025-03-05T12:00:00Z");

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns 'just now' for < 5 seconds ago", () => {
    expect(formatDateTimeRelative("2025-03-05T11:59:57Z")).toBe("just now");
  });

  it("returns seconds ago for 5-59 seconds", () => {
    expect(formatDateTimeRelative("2025-03-05T11:59:30Z")).toBe("30 secs ago");
  });

  it("returns minutes ago for 1-59 minutes", () => {
    expect(formatDateTimeRelative("2025-03-05T11:30:00Z")).toBe("30 mins ago");
  });

  it("returns hours ago for 1-23 hours", () => {
    expect(formatDateTimeRelative("2025-03-05T06:00:00Z")).toBe("6 hours ago");
  });

  it("returns 'Yesterday' for 24-47 hours", () => {
    expect(formatDateTimeRelative("2025-03-04T12:00:00Z")).toBe("Yesterday");
  });

  it("returns weekday name for 2-6 days ago", () => {
    // 2025-03-02 is a Sunday
    const result = formatDateTimeRelative("2025-03-02T12:00:00Z");
    expect(result).toBe("Sun");
  });

  it("returns formatted date for > 7 days ago", () => {
    expect(formatDateTimeRelative("2025-02-20T12:00:00Z")).toBe("20 Feb 2025");
  });

  it("pluralizes correctly: '6 secs ago'", () => {
    expect(formatDateTimeRelative("2025-03-05T11:59:54Z")).toBe("6 secs ago");
  });

  it("pluralizes singular: '1 hour ago'", () => {
    expect(formatDateTimeRelative("2025-03-05T11:00:00Z")).toBe("1 hour ago");
  });

  it("returns formatted date for future timestamps", () => {
    expect(formatDateTimeRelative("2025-04-05T12:00:00Z")).toBe("05 Apr 2025");
  });
});

describe("formatDateRelative", () => {
  const NOW = new Date("2025-03-05T14:30:00Z");

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns UTC time string for today", () => {
    const result = formatDateRelative("2025-03-05T14:30:00Z");
    expect(result).toBe("14:30");
  });

  it("returns 'Yesterday' for 1 day ago", () => {
    expect(formatDateRelative("2025-03-04T10:00:00Z")).toBe("Yesterday");
  });

  it("returns formatted date for 7+ days ago", () => {
    expect(formatDateRelative("2025-02-20T12:00:00Z")).toBe("20 Feb 2025");
  });

  it("returns formatted date for future timestamps", () => {
    expect(formatDateRelative("2025-04-05T12:00:00Z")).toBe("05 Apr 2025");
  });
});

// =============================================================================
// formatTimeSpan (use explicit base for determinism)
// =============================================================================

describe("formatTimeSpan", () => {
  const base = "2025-03-05T12:00:00Z";

  it("returns relative minutes for future", () => {
    const result = formatTimeSpan("2025-03-05T12:30:00Z", base);
    expect(result).toMatch(/30\s*minute/i);
  });

  it("returns relative hours", () => {
    const result = formatTimeSpan("2025-03-05T15:00:00Z", base);
    expect(result).toMatch(/3\s*hour/i);
  });

  it("returns relative days", () => {
    const result = formatTimeSpan("2025-03-08T12:00:00Z", base);
    expect(result).toMatch(/3\s*day/i);
  });

  it("handles past times", () => {
    const result = formatTimeSpan("2025-03-05T11:30:00Z", base);
    expect(result).toMatch(/30\s*minute/i);
    expect(result).toContain("ago");
  });
});

// =============================================================================
// formatDuration (pure)
// =============================================================================

describe("formatDuration", () => {
  const base = new Date("2025-01-01T00:00:00Z");

  it("returns 'less than a minute' for < 60 seconds", () => {
    const end = new Date(base.getTime() + 30_000);
    expect(formatDuration(base, end)).toBe("less than a minute");
  });

  it("returns singular minute", () => {
    const end = new Date(base.getTime() + 60_000);
    expect(formatDuration(base, end)).toBe("1 minute");
  });

  it("returns plural minutes", () => {
    const end = new Date(base.getTime() + 5 * 60_000);
    expect(formatDuration(base, end)).toBe("5 minutes");
  });

  it("returns hours and minutes", () => {
    const end = new Date(base.getTime() + 2 * 60 * 60_000 + 30 * 60_000);
    expect(formatDuration(base, end)).toBe("2 hours 30 minutes");
  });

  it("returns days and hours", () => {
    const end = new Date(base.getTime() + 24 * 60 * 60_000 + 3 * 60 * 60_000);
    expect(formatDuration(base, end)).toBe("1 day 3 hours");
  });

  it("omits zero sub-units", () => {
    const end = new Date(base.getTime() + 2 * 60 * 60_000);
    expect(formatDuration(base, end)).toBe("2 hours");
  });

  it("is direction-independent", () => {
    const end = new Date(base.getTime() + 60 * 60_000);
    expect(formatDuration(base, end)).toBe(formatDuration(end, base));
  });
});

// =============================================================================
// getMonthGrid
// =============================================================================

describe("getMonthGrid", () => {
  it("returns weeks of 7 days each", () => {
    const grid = getMonthGrid(2025, 0); // January 2025
    for (const week of grid) {
      expect(week.length).toBe(7);
    }
  });

  it("starts on Monday (ISO week)", () => {
    const grid = getMonthGrid(2025, 0);
    // First day of first week should be Monday (1)
    expect(grid[0]![0]!.getDay()).toBe(1);
  });

  it("includes all days of the target month", () => {
    const grid = getMonthGrid(2025, 0); // January has 31 days
    const allDays = grid.flat();
    const januaryDays = allDays.filter((d) => d.getMonth() === 0 && d.getFullYear() === 2025);
    expect(januaryDays.length).toBe(31);
  });
});

// =============================================================================
// getWeekDays
// =============================================================================

describe("getWeekDays", () => {
  it("returns 7 days starting from Monday", () => {
    const days = getWeekDays(new Date("2025-03-05")); // Wednesday
    expect(days.length).toBe(7);
    expect(days[0]!.getDay()).toBe(1); // Monday
  });

  it("returns correct week for date falling on Sunday", () => {
    const days = getWeekDays(new Date("2025-03-09")); // Sunday
    expect(days[0]!.getDay()).toBe(1); // Still starts Monday
  });
});

// =============================================================================
// getDateRange
// =============================================================================

describe("getDateRange", () => {
  it("month view includes padding days", () => {
    const { from } = getDateRange("month", new Date("2025-03-15"));
    // March 1 2025 is Saturday, so week starts Monday Feb 24
    expect(from.getTime()).toBeLessThan(new Date("2025-03-01").getTime());
  });

  it("week view returns 7-day span", () => {
    const { from, to } = getDateRange("week", new Date("2025-03-05"));
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(7);
  });
});

// =============================================================================
// itemOnDate
// =============================================================================

describe("itemOnDate", () => {
  it("returns true for event spanning the date", () => {
    const item = { startsAt: "2025-03-04T10:00", endsAt: "2025-03-06T18:00", deadline: null };
    expect(itemOnDate(item, new Date("2025-03-05"))).toBe(true);
  });

  it("returns false for event not spanning the date", () => {
    const item = { startsAt: "2025-03-01T10:00", endsAt: "2025-03-02T18:00", deadline: null };
    expect(itemOnDate(item, new Date("2025-03-05"))).toBe(false);
  });

  it("returns true for deadline on the same day", () => {
    const item = { startsAt: null, endsAt: null, deadline: "2025-03-05T10:00" };
    expect(itemOnDate(item, new Date("2025-03-05"))).toBe(true);
  });

  it("returns false for deadline on different day", () => {
    const item = { startsAt: null, endsAt: null, deadline: "2025-03-06T10:00" };
    expect(itemOnDate(item, new Date("2025-03-05"))).toBe(false);
  });

  it("returns false when no startsAt/endsAt/deadline", () => {
    const item = { startsAt: null, endsAt: null, deadline: null };
    expect(itemOnDate(item, new Date("2025-03-05"))).toBe(false);
  });
});

// =============================================================================
// getDayItems
// =============================================================================

describe("getDayItems", () => {
  it("filters items to those on the given date", () => {
    const items = [
      { startsAt: "2025-03-05T10:00", endsAt: "2025-03-05T12:00", deadline: null },
      { startsAt: "2025-03-06T10:00", endsAt: "2025-03-06T12:00", deadline: null },
      { startsAt: null, endsAt: null, deadline: "2025-03-05T15:00" },
    ];
    expect(getDayItems(items, new Date("2025-03-05")).length).toBe(2);
  });

  it("returns empty array when no items match", () => {
    expect(getDayItems([], new Date("2025-03-05")).length).toBe(0);
  });
});

// =============================================================================
// Date checks
// =============================================================================

describe("isToday", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-03-05T12:00:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns true for today's date", () => {
    expect(isToday(new Date("2025-03-05"))).toBe(true);
  });

  it("returns false for yesterday", () => {
    expect(isToday(new Date("2025-03-04"))).toBe(false);
  });
});

describe("isSameMonth", () => {
  it("returns true for dates in same month", () => {
    expect(isSameMonth(new Date("2025-03-01"), new Date("2025-03-31"))).toBe(true);
  });

  it("returns false for dates in different months", () => {
    expect(isSameMonth(new Date("2025-03-01"), new Date("2025-04-01"))).toBe(false);
  });
});

describe("isSameDay", () => {
  it("returns true for same date different times", () => {
    expect(isSameDay(new Date("2025-03-05T10:00"), new Date("2025-03-05T22:00"))).toBe(true);
  });

  it("returns false for different dates", () => {
    expect(isSameDay(new Date("2025-03-05"), new Date("2025-03-06"))).toBe(false);
  });
});

// =============================================================================
// Formatting (calendar-specific)
// =============================================================================

describe("formatting", () => {
  it("formatMonthYear returns English month name", () => {
    expect(formatMonthYear(new Date("2025-03-05"))).toBe("March 2025");
  });

  it("formatDayNumber returns day without padding", () => {
    expect(formatDayNumber(new Date("2025-03-05"))).toBe("5");
  });

  it("formatWeekdayShort returns 2-letter English abbreviation", () => {
    // 2025-03-05 is Wednesday -> "We" (first two chars of "Wed")
    expect(formatWeekdayShort(new Date("2025-03-05"))).toBe("We");
  });

  it("formatFullDate returns European-style format", () => {
    expect(formatFullDate(new Date("2025-03-05"))).toBe("5. March 2025");
  });

  it("formatDateKey returns YYYY-MM-DD", () => {
    expect(formatDateKey(new Date("2025-03-05"))).toBe("2025-03-05");
  });

  it("formatTime returns HH:mm", () => {
    expect(formatTime("2025-03-05T14:30:00")).toBe("14:30");
  });
});

// =============================================================================
// Locale support
// =============================================================================

describe("locale support", () => {
  it("formatMonthYear supports locale", () => {
    expect(formatMonthYear(new Date("2025-03-05"), "de")).toBe("März 2025");
  });

  it("formatWeekdayShort supports locale", () => {
    // Wednesday in German short is "Mi", sliced to 2 chars -> "Mi"
    expect(formatWeekdayShort(new Date("2025-03-05"), "de")).toBe("Mi");
  });

  it("formatFullDate supports locale", () => {
    expect(formatFullDate(new Date("2025-03-05"), "de")).toBe("5. März 2025");
  });
});

// =============================================================================
// weekdays() and months() generators
// =============================================================================

describe("weekdays", () => {
  it("returns 7 short weekday names in English by default", () => {
    const result = weekdays();
    expect(result.length).toBe(7);
    expect(result).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("starts with Monday (ISO order)", () => {
    expect(weekdays()[0]).toBe("Mon");
  });

  it("supports locale parameter", () => {
    const result = weekdays("de");
    expect(result.length).toBe(7);
    expect(result[0]).toBe("Mo");
    expect(result[2]).toBe("Mi"); // Wednesday in German
  });
});

describe("months", () => {
  it("returns 12 long month names in English by default", () => {
    const result = months();
    expect(result.length).toBe(12);
    expect(result[0]).toBe("January");
    expect(result[2]).toBe("March");
    expect(result[11]).toBe("December");
  });

  it("supports locale parameter", () => {
    const result = months("de");
    expect(result.length).toBe(12);
    expect(result[0]).toBe("Januar");
    expect(result[2]).toBe("März");
    expect(result[11]).toBe("Dezember");
  });
});

// =============================================================================
// Navigation
// =============================================================================

describe("navigation", () => {
  it("addMonths adds months correctly", () => {
    const result = addMonths(new Date("2025-01-15"), 2);
    expect(result.getMonth()).toBe(2); // March
  });

  it("addWeeks adds weeks correctly", () => {
    const result = addWeeks(new Date("2025-03-01"), 1);
    expect(result.getDate()).toBe(8);
  });

  it("addDays adds days correctly", () => {
    const result = addDays(new Date("2025-03-05"), 3);
    expect(result.getDate()).toBe(8);
  });

  it("startOfMonth returns first day", () => {
    const result = startOfMonth(new Date("2025-03-15"));
    expect(result.getDate()).toBe(1);
  });

  it("startOfWeek returns Monday", () => {
    const result = startOfWeek(new Date("2025-03-05")); // Wednesday
    expect(result.getDay()).toBe(1); // Monday
  });
});

// =============================================================================
// URL helpers
// =============================================================================

describe("URL helpers", () => {
  it("buildCalendarUrl sets view=calendar", () => {
    const url = buildCalendarUrl("/page", {});
    expect(url).toContain("view=calendar");
  });

  it("buildCalendarUrl includes cv and cd params", () => {
    const url = buildCalendarUrl("/page", {
      view: "week",
      date: new Date("2025-03-05"),
    });
    expect(url).toContain("cv=week");
    expect(url).toContain("cd=2025-03-05");
  });

  it("buildCalendarUrl preserves existing query params", () => {
    const url = buildCalendarUrl("/page?existing=1", { view: "month" });
    expect(url).toContain("existing=1");
    expect(url).toContain("cv=month");
  });

  it("parseCalendarDate parses valid date string", () => {
    const result = parseCalendarDate("2025-03-05");
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2); // March = 2
    expect(result.getDate()).toBe(5);
  });

  it("parseCalendarDate returns today for undefined", () => {
    const result = parseCalendarDate(undefined);
    const t = today();
    expect(isSameDay(result, t)).toBe(true);
  });
});
