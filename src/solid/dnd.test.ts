import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createRoot } from "solid-js";
import { dnd } from "./dnd";

// ==========================
// SSR safety
// ==========================
//
// dnd.create() and its destroy() must not touch `window` in environments
// where it doesn't exist (SSR, server cleanup via solid-js cleanNode).
//
// Other test files stub `window` onto globalThis, and bun shares the
// process across files. To deterministically simulate SSR we delete
// `window` for the test scope and restore it afterwards.

type GlobalSlot = "window" | "document";

const stripGlobals = () => {
  const saved: Record<GlobalSlot, { had: boolean; value: unknown }> = {
    window: { had: false, value: undefined },
    document: { had: false, value: undefined },
  };
  for (const key of ["window", "document"] as const) {
    const g = globalThis as Record<string, unknown>;
    saved[key] = { had: key in g, value: g[key] };
    delete g[key];
  }
  return () => {
    for (const key of ["window", "document"] as const) {
      const g = globalThis as Record<string, unknown>;
      if (saved[key].had) g[key] = saved[key].value;
    }
  };
};

describe("dnd SSR safety", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = stripGlobals();
  });

  afterEach(() => {
    restore();
  });

  it("create() does not throw without window/document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    createRoot((dispose) => {
      expect(() => dnd.create()).not.toThrow();
      dispose();
    });
  });

  it("destroy() does not throw without window/document", () => {
    createRoot((dispose) => {
      const ctrl = dnd.create();
      expect(() => ctrl.destroy()).not.toThrow();
      dispose();
    });
  });
});
