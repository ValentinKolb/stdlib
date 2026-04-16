import { describe, it, expect } from "bun:test";
import {
  slugify,
  humanize,
  titleify,
  pprintBytes,
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
  it("returns '0 bytes' for zero", () => {
    expect(pprintBytes(0)).toBe("0 bytes");
  });

  it("returns bytes for small values", () => {
    expect(pprintBytes(512)).toBe("512 bytes");
  });

  it("formats KB with two decimals when < 10 KB", () => {
    expect(pprintBytes(1536)).toBe("1.50 KB");
  });

  it("formats MB", () => {
    expect(pprintBytes(1048576)).toBe("1.00 MB");
  });

  it("formats GB", () => {
    expect(pprintBytes(1073741824)).toBe("1.00 GB");
  });

  it("reduces decimals for larger values", () => {
    // 123 MB -> 0 decimals
    expect(pprintBytes(123 * 1024 * 1024)).toBe("123 MB");
  });

  it("returns '0 bytes' for negative values", () => {
    expect(pprintBytes(-100)).toBe("0 bytes");
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
