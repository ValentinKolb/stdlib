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

export const text = {
  slugify,
  humanize,
  titleify,
  pprintBytes,
} as const;
