import { describe, it, expect, mock } from "bun:test";
import { withMinLoadTime, buffer, jitter, sleep, random, shuffle } from "./timing";

// ==========================
// withMinLoadTime
// ==========================

describe("withMinLoadTime", () => {
  it("returns result of async function", async () => {
    const result = await withMinLoadTime(() => Promise.resolve(42), 0);
    expect(result).toBe(42);
  });

  it("delays if function is faster than minimum", async () => {
    const start = Date.now();
    await withMinLoadTime(() => Promise.resolve(1), 100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("does not add extra delay if function is slower than minimum", async () => {
    const start = Date.now();
    await withMinLoadTime(
      () => new Promise((r) => setTimeout(() => r(1), 100)),
      50,
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(180);
  });
});

// ==========================
// buffer (uses real timers with short delays)
// ==========================

describe("buffer", () => {
  it("calls flush function after interval for a key", async () => {
    const flush = mock(async (_key: string, _data: string) => {});
    const buffered = buffer(flush, 50);

    buffered("k1", "data1");
    await Bun.sleep(100);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("k1", "data1");
  });

  it("coalesces multiple writes to same key", async () => {
    const flush = mock(async (_key: string, _data: string) => {});
    const buffered = buffer(flush, 50);

    buffered("k1", "v1");
    buffered("k1", "v2");
    buffered("k1", "v3");
    await Bun.sleep(100);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("k1", "v3");
  });

  it("handles multiple keys independently", async () => {
    const flush = mock(async (_key: string, _data: string) => {});
    const buffered = buffer(flush, 50);

    buffered("k1", "v1");
    buffered("k2", "v2");
    await Bun.sleep(100);

    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not drop falsy payloads like 0 or empty string", async () => {
    const flush = mock(async (_key: string, _data: number) => {});
    const buffered = buffer(flush, 50);

    buffered("k1", 0);
    await Bun.sleep(100);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("k1", 0);
  });
});

// ==========================
// jitter
// ==========================

describe("jitter", () => {
  it("returns value within expected range", () => {
    for (let i = 0; i < 1000; i++) {
      const result = jitter(100, 10);
      expect(result).toBeGreaterThanOrEqual(90);
      expect(result).toBeLessThanOrEqual(110);
    }
  });

  it("returns base value when range is 0", () => {
    expect(jitter(100, 0)).toBe(100);
  });

  it("has approximate uniform distribution", () => {
    const samples = Array.from({ length: 1000 }, () => jitter(100, 10));
    const mean = samples.reduce((a, b) => a + b) / samples.length;
    expect(Math.abs(mean - 100)).toBeLessThan(2);
  });
});

// ==========================
// sleep
// ==========================

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("resolves immediately for 0ms", async () => {
    const start = Date.now();
    await sleep(0);
    expect(Date.now() - start).toBeLessThan(20);
  });

  it("returns void (no value)", async () => {
    const result = await sleep(0);
    expect(result).toBeUndefined();
  });
});

// ==========================
// random
// ==========================

describe("random", () => {
  it("returns value in [0, 1) by default", () => {
    for (let i = 0; i < 500; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("respects min and max range", () => {
    for (let i = 0; i < 500; i++) {
      const v = random(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("rounds to step when provided", () => {
    for (let i = 0; i < 500; i++) {
      const v = random(0, 100, 5);
      expect(v % 5).toBe(0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("returns integers when step is 1", () => {
    for (let i = 0; i < 500; i++) {
      const v = random(1, 10, 1);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("has reasonable distribution", () => {
    const samples = Array.from({ length: 1000 }, () => random(0, 100));
    const mean = samples.reduce((a, b) => a + b) / samples.length;
    expect(mean).toBeGreaterThan(30);
    expect(mean).toBeLessThan(70);
  });
});

// ==========================
// shuffle
// ==========================

describe("shuffle", () => {
  it("returns array with same elements", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it("returns new array reference", () => {
    const input = [1, 2, 3];
    const result = shuffle(input);
    expect(result).not.toBe(input);
  });

  it("handles empty array", () => {
    expect(shuffle([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it("actually shuffles (not always identity)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let identityCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = shuffle(input);
      if (result.every((v, j) => v === input[j])) identityCount++;
    }
    // Extremely unlikely to get identity more than a few times out of 50
    expect(identityCount).toBeLessThan(5);
  });
});
