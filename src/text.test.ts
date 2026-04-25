import { describe, it, expect } from "bun:test";
import {
  slugify,
  humanize,
  titleify,
  pprintBytes,
  pprintBytesParts,
  truncate,
  summarize,
  camelCase,
  snakeCase,
  kebabCase,
  pascalCase,
} from "./text";

// ==========================
// slugify
// ==========================

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("caf\u00e9")).toBe("cafe");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("collapses multiple non-alphanum chars into single hyphen", () => {
    expect(slugify("a!!!b")).toBe("a-b");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("handles German umlauts", () => {
    expect(slugify("\u00dcberpr\u00fcfung")).toBe("uberprufung");
  });
});

// ==========================
// humanize
// ==========================

describe("humanize", () => {
  it("replaces underscores and hyphens with spaces, capitalizes first letter", () => {
    expect(humanize("hello_world")).toBe("Hello world");
  });

  it("replaces hyphens with spaces", () => {
    expect(humanize("hello-world-foo")).toBe("Hello world foo");
  });

  it("trims leading/trailing underscores and spaces", () => {
    expect(humanize("__hello__")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(humanize("")).toBe("");
  });
});

// ==========================
// titleify
// ==========================

describe("titleify", () => {
  it("capitalizes first letter of each word", () => {
    expect(titleify("hello world foo")).toBe("Hello World Foo");
  });

  it("works on hyphenated input", () => {
    expect(titleify("hello-world")).toBe("Hello World");
  });

  it("works on underscored input", () => {
    expect(titleify("hello_world")).toBe("Hello World");
  });
});

// ==========================
// pprintBytes
// ==========================

describe("pprintBytes", () => {
  it("returns '0 B' for zero", () => {
    expect(pprintBytes(0)).toBe("0 B");
  });

  it("returns raw bytes without decimals", () => {
    expect(pprintBytes(512)).toBe("512 B");
    expect(pprintBytes(1023)).toBe("1023 B");
  });

  it("defaults to IEC (1024-base) with KiB/MiB/GiB/TiB/PiB labels", () => {
    expect(pprintBytes(1024)).toBe("1 KiB");
    expect(pprintBytes(1536)).toBe("1.5 KiB");
    expect(pprintBytes(1024 ** 2)).toBe("1 MiB");
    expect(pprintBytes(1024 ** 3)).toBe("1 GiB");
    expect(pprintBytes(1024 ** 4)).toBe("1 TiB");
    expect(pprintBytes(1024 ** 5)).toBe("1 PiB");
  });

  it("uses SI (1000-base) with KB/MB/GB/TB/PB labels in si mode", () => {
    expect(pprintBytes(1000, "si")).toBe("1 KB");
    expect(pprintBytes(1500, "si")).toBe("1.5 KB");
    expect(pprintBytes(1_000_000, "si")).toBe("1 MB");
    expect(pprintBytes(1_000_000_000, "si")).toBe("1 GB");
    expect(pprintBytes(1e12, "si")).toBe("1 TB");
    expect(pprintBytes(1e15, "si")).toBe("1 PB");
  });

  it("scales decimals by magnitude (2 / 1 / 0)", () => {
    expect(pprintBytes(1024 + 512)).toBe("1.5 KiB"); // < 10 -> 1-2 dec
    expect(pprintBytes(15 * 1024)).toBe("15 KiB"); // >= 10 -> 1 dec, .0 trimmed
    expect(pprintBytes(15.5 * 1024)).toBe("15.5 KiB");
    expect(pprintBytes(123 * 1024 * 1024)).toBe("123 MiB"); // >= 100 -> 0 dec
  });

  it("caps at the largest unit instead of overflowing", () => {
    // 2048 PiB still rendered in PiB
    expect(pprintBytes(2 * 1024 ** 5)).toBe("2 PiB");
  });

  it("returns '0 B' for negative, NaN, and Infinity", () => {
    expect(pprintBytes(-100)).toBe("0 B");
    expect(pprintBytes(Number.NaN)).toBe("0 B");
    expect(pprintBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});

// ==========================
// pprintBytesParts
// ==========================

describe("pprintBytesParts", () => {
  it("splits value and unit", () => {
    expect(pprintBytesParts(1536)).toEqual({ value: "1.5", unit: "KiB" });
    expect(pprintBytesParts(1500, "si")).toEqual({ value: "1.5", unit: "KB" });
  });

  it("returns { '0', 'B' } for invalid input", () => {
    expect(pprintBytesParts(0)).toEqual({ value: "0", unit: "B" });
    expect(pprintBytesParts(-1)).toEqual({ value: "0", unit: "B" });
    expect(pprintBytesParts(Number.NaN)).toEqual({ value: "0", unit: "B" });
  });

  it("formats raw bytes without decimals", () => {
    expect(pprintBytesParts(512)).toEqual({ value: "512", unit: "B" });
  });
});

// ==========================
// truncate
// ==========================

describe("truncate", () => {
  it("returns unchanged if within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates at end with ellipsis (default mode)", () => {
    expect(truncate("Hello World", 6)).toBe("Hello…");
  });

  it("truncates in middle", () => {
    expect(truncate("Hello World", 6, "middle")).toBe("He…rld");
  });

  it("handles exact limit length (no truncation needed)", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("handles limit of 1", () => {
    expect(truncate("hello", 1)).toBe("…");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

// ==========================
// summarize
// ==========================

describe("summarize", () => {
  it("returns unchanged if within limit", () => {
    expect(summarize("hello", 10)).toBe("hello");
  });

  it('adds "[N chars omitted]" suffix', () => {
    expect(summarize("Hello World", 6)).toBe("Hello… [6 chars omitted]");
  });

  it("works with middle mode", () => {
    expect(summarize("Hello World", 6, "middle")).toBe(
      "He…rld [6 chars omitted]",
    );
  });

  it("omitted count is correct", () => {
    // 20 chars, limit 10 -> 11 omitted (20 - 10 + 1)
    const input = "abcdefghijklmnopqrst"; // 20 chars
    const result = summarize(input, 10);
    expect(result).toContain("[11 chars omitted]");
  });
});

// ==========================
// camelCase
// ==========================

describe("camelCase", () => {
  it('converts "hello world" to "helloWorld"', () => {
    expect(camelCase("hello world")).toBe("helloWorld");
  });

  it('converts "Hello World" to "helloWorld"', () => {
    expect(camelCase("Hello World")).toBe("helloWorld");
  });

  it('converts "hello_world" to "helloWorld"', () => {
    expect(camelCase("hello_world")).toBe("helloWorld");
  });

  it('converts "hello-world" to "helloWorld"', () => {
    expect(camelCase("hello-world")).toBe("helloWorld");
  });

  it('converts "HelloWorld" to "helloWorld"', () => {
    expect(camelCase("HelloWorld")).toBe("helloWorld");
  });

  it('converts "HTML parser" to "htmlParser"', () => {
    expect(camelCase("HTML parser")).toBe("htmlParser");
  });
});

// ==========================
// snakeCase
// ==========================

describe("snakeCase", () => {
  it('converts "hello world" to "hello_world"', () => {
    expect(snakeCase("hello world")).toBe("hello_world");
  });

  it('converts "helloWorld" to "hello_world"', () => {
    expect(snakeCase("helloWorld")).toBe("hello_world");
  });

  it('converts "HelloWorld" to "hello_world"', () => {
    expect(snakeCase("HelloWorld")).toBe("hello_world");
  });

  it('converts "hello-world" to "hello_world"', () => {
    expect(snakeCase("hello-world")).toBe("hello_world");
  });
});

// ==========================
// kebabCase
// ==========================

describe("kebabCase", () => {
  it('converts "hello world" to "hello-world"', () => {
    expect(kebabCase("hello world")).toBe("hello-world");
  });

  it('converts "helloWorld" to "hello-world"', () => {
    expect(kebabCase("helloWorld")).toBe("hello-world");
  });

  it('converts "hello_world" to "hello-world"', () => {
    expect(kebabCase("hello_world")).toBe("hello-world");
  });
});

// ==========================
// pascalCase
// ==========================

describe("pascalCase", () => {
  it('converts "hello world" to "HelloWorld"', () => {
    expect(pascalCase("hello world")).toBe("HelloWorld");
  });

  it('converts "helloWorld" to "HelloWorld"', () => {
    expect(pascalCase("helloWorld")).toBe("HelloWorld");
  });

  it('converts "hello_world" to "HelloWorld"', () => {
    expect(pascalCase("hello_world")).toBe("HelloWorld");
  });

  it('converts "hello-world" to "HelloWorld"', () => {
    expect(pascalCase("hello-world")).toBe("HelloWorld");
  });
});
