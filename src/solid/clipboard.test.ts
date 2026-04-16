import { describe, it, expect, mock } from "bun:test";
import { testRoot } from "../_test-helpers";
import { clipboard } from "./clipboard";

// Mock navigator.clipboard
const writeTextMock = mock(() => Promise.resolve());
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: writeTextMock } },
  writable: true,
  configurable: true,
});

describe("clipboard.create", () => {
  it("returns copy function and wasCopied signal", () => {
    const { result, dispose } = testRoot(() => clipboard.create());
    expect(typeof result.copy).toBe("function");
    expect(result.wasCopied()).toBe(false);
    dispose();
  });

  it("copy calls navigator.clipboard.writeText", async () => {
    writeTextMock.mockClear();
    const { result, dispose } = testRoot(() => clipboard.create());
    await result.copy("hello");
    expect(writeTextMock).toHaveBeenCalledWith("hello");
    dispose();
  });

  it("wasCopied becomes true after copy", async () => {
    const { result, dispose } = testRoot(() => clipboard.create());
    await result.copy("test");
    expect(result.wasCopied()).toBe(true);
    dispose();
  });

  it("wasCopied resets to false after timeout", async () => {
    const { result, dispose } = testRoot(() => clipboard.create(50));
    await result.copy("test");
    expect(result.wasCopied()).toBe(true);
    await Bun.sleep(80);
    expect(result.wasCopied()).toBe(false);
    dispose();
  });

  it("wasCopied stays false when writeText rejects", async () => {
    const failMock = mock(() => Promise.reject(new Error("denied")));
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: failMock } },
      writable: true,
      configurable: true,
    });

    // Suppress expected console.error from the catch block
    const origError = console.error;
    console.error = () => {};

    const { result, dispose } = testRoot(() => clipboard.create());
    await result.copy("nope");
    expect(result.wasCopied()).toBe(false);
    dispose();

    console.error = origError;

    // Restore working mock
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
  });
});
