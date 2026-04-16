import { describe, it, expect } from "bun:test";
import { slugify, humanize, titleify, pprintBytes } from "./text";

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
