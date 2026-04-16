// ==========================
// Text Manipulation Utilities
// ==========================

/**
 * Convert a string to a URL-friendly slug.
 *
 * Processing pipeline:
 * 1. NFKD normalization -- decomposes characters like "u" into base + combining mark.
 * 2. Strip combining diacritical marks (`U+0300`-`U+036F`).
 * 3. Lowercase.
 * 4. Trim whitespace.
 * 5. Replace non-alphanumeric runs with a single hyphen.
 * 6. Strip leading/trailing hyphens.
 *
 * An empty input string produces an empty output string.
 *
 * @param content - The string to slugify.
 * @returns A URL-safe slug (lowercase, hyphen-separated).
 *
 * @example text.slugify("Hello World!")   // "hello-world"
 * @example text.slugify("Uber uns")       // "uber-uns"
 * @example text.slugify("")               // ""
 * @example text.slugify("---")            // ""
 */
export const slugify = (content: string): string =>
  content
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Convert a string to human-readable format.
 *
 * Strips leading/trailing underscores and whitespace, collapses runs of
 * underscores, hyphens, and spaces into single spaces, then capitalizes
 * the first letter of the result.
 *
 * @param content - The string to humanize (e.g. a slug or variable name).
 * @returns A human-readable string with the first letter uppercased.
 *
 * @example text.humanize("hello_world-foo") // "Hello world foo"
 * @example text.humanize("_leading_")       // "Leading"
 */
export const humanize = (content: string): string =>
  content
    .replace(/^[\s_]+|[\s_]+$/g, "")
    .replace(/[_\s]+/g, " ")
    .replace(/[-\s]+/g, " ")
    .replace(/^[a-z]/, (m) => m.toUpperCase());

/**
 * Convert a string to title case by capitalizing the first letter of each word.
 *
 * Internally delegates to {@link humanize} first, so underscores, hyphens,
 * and extra whitespace are cleaned up before title-casing.
 *
 * @param content - The string to convert to title case.
 * @returns A title-cased string.
 *
 * @example text.titleify("hello world foo")   // "Hello World Foo"
 * @example text.titleify("hello_world-foo")   // "Hello World Foo"
 */
export const titleify = (content: string): string => {
  const humanized = humanize(content);
  return humanized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Pretty-print a byte count in human-readable format.
 *
 * Uses binary units (1 KB = 1024 bytes) with the progression:
 * bytes -> KB -> MB -> GB -> TB.
 *
 * Guards against `Infinity`, `NaN`, and non-positive values by returning
 * `"0 bytes"`. Decimal places are adjusted for readability: 0 decimals
 * when the value >= 100, 1 decimal when >= 10, and 2 decimals otherwise.
 *
 * @param bytes - Number of bytes (must be a finite positive number).
 * @returns A human-readable size string, e.g. `"1.50 KB"`, `"512 MB"`.
 *
 * @example text.pprintBytes(0)      // "0 bytes"
 * @example text.pprintBytes(1536)   // "1.50 KB"
 * @example text.pprintBytes(NaN)    // "0 bytes"
 */
export const pprintBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";

  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const base = 1024;

  const exponent = Math.floor(Math.log(bytes) / Math.log(base));
  const unit = units[Math.min(exponent, units.length - 1)];

  if (exponent === 0) {
    return `${bytes} ${unit}`;
  }

  const value = bytes / Math.pow(base, exponent);

  // Show appropriate decimal places
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(decimals)} ${unit}`;
};

/**
 * Split any string into lowercase words, handling camelCase, PascalCase,
 * snake_case, kebab-case, and space-separated inputs.
 *
 * @param content - The string to split into words.
 * @returns An array of lowercase words.
 */
const splitWords = (content: string): string[] =>
  content
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

/**
 * Truncate a string to a maximum length, adding an ellipsis character.
 *
 * In `"end"` mode (the default) the ellipsis replaces the tail of the string.
 * In `"middle"` mode the ellipsis is placed in the centre so that the
 * beginning and end of the original string are preserved.
 *
 * The limit includes the ellipsis character itself.  If the content already
 * fits within the limit it is returned unchanged.
 *
 * @param content - The string to truncate.
 * @param limit   - Maximum allowed length (including the ellipsis).
 * @param mode    - `"end"` (default) or `"middle"`.
 * @returns The (possibly truncated) string.
 *
 * @example text.truncate("Hello World", 6)            // "Hello…"
 * @example text.truncate("Hello World", 6, "middle")  // "He…ld"
 */
export const truncate = (
  content: string,
  limit: number,
  mode: "end" | "middle" = "end",
): string => {
  if (content.length <= limit) return content;
  if (mode === "middle") {
    const half = Math.floor((limit - 1) / 2);
    return content.slice(0, half) + "…" + content.slice(-(limit - 1 - half));
  }
  return content.slice(0, limit - 1) + "…";
};

/**
 * Truncate a string like {@link truncate}, then append a human-readable
 * `[N chars omitted]` suffix so the reader knows how much was removed.
 *
 * The omitted-info suffix is **not** counted toward the limit.
 *
 * @param content - The string to summarize.
 * @param limit   - Maximum allowed length for the visible part (including ellipsis).
 * @param mode    - `"end"` (default) or `"middle"`.
 * @returns The truncated string followed by ` [N chars omitted]`, or the
 *          original string if it already fits.
 *
 * @example text.summarize("Hello World", 6)  // "Hello… [6 chars omitted]"
 */
export const summarize = (
  content: string,
  limit: number,
  mode: "end" | "middle" = "end",
): string => {
  if (content.length <= limit) return content;
  const omitted = content.length - limit + 1;
  const truncated = truncate(content, limit, mode);
  return `${truncated} [${omitted} chars omitted]`;
};

/**
 * Convert a string to camelCase.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, and
 * space-separated inputs.
 *
 * @param content - The string to convert.
 * @returns The camelCased string.
 *
 * @example text.camelCase("hello world")  // "helloWorld"
 * @example text.camelCase("HelloWorld")   // "helloWorld"
 */
export const camelCase = (content: string): string => {
  const words = splitWords(content);
  return words
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
};

/**
 * Convert a string to PascalCase.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, and
 * space-separated inputs.
 *
 * @param content - The string to convert.
 * @returns The PascalCased string.
 *
 * @example text.pascalCase("hello world")  // "HelloWorld"
 * @example text.pascalCase("hello_world")  // "HelloWorld"
 */
export const pascalCase = (content: string): string =>
  splitWords(content)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

/**
 * Convert a string to snake_case.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, and
 * space-separated inputs.
 *
 * @param content - The string to convert.
 * @returns The snake_cased string.
 *
 * @example text.snakeCase("hello world")  // "hello_world"
 * @example text.snakeCase("helloWorld")   // "hello_world"
 */
export const snakeCase = (content: string): string =>
  splitWords(content).join("_");

/**
 * Convert a string to kebab-case.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, and
 * space-separated inputs.
 *
 * @param content - The string to convert.
 * @returns The kebab-cased string.
 *
 * @example text.kebabCase("hello world")  // "hello-world"
 * @example text.kebabCase("hello_world")  // "hello-world"
 */
export const kebabCase = (content: string): string =>
  splitWords(content).join("-");

export const text = {
  slugify,
  humanize,
  titleify,
  pprintBytes,
  truncate,
  summarize,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
} as const;
