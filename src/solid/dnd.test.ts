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

// ============================================================================
// Audit fixes — non-DOM checks (validation, idempotency, callback safety)
// ============================================================================

describe("dnd option validation", () => {
  it("throws TypeError on non-finite activationDistance", () => {
    expect(() => {
      createRoot(() => dnd.create({ activationDistance: NaN }));
    }).toThrow(/activationDistance/);
    expect(() => {
      createRoot(() => dnd.create({ activationDistance: Infinity }));
    }).toThrow(/activationDistance/);
  });

  it("throws TypeError on negative activationDistance", () => {
    expect(() => {
      createRoot(() => dnd.create({ activationDistance: -1 }));
    }).toThrow(/activationDistance/);
  });

  it("throws TypeError on non-finite touchActivationDelayMs", () => {
    expect(() => {
      createRoot(() => dnd.create({ touchActivationDelayMs: NaN }));
    }).toThrow(/touchActivationDelayMs/);
  });

  it("accepts 0 (zero) for activationDistance and touchActivationDelayMs", () => {
    expect(() => {
      createRoot(() =>
        dnd.create({ activationDistance: 0, touchActivationDelayMs: 0 }),
      );
    }).not.toThrow();
  });
});

describe("dnd idempotent destroy", () => {
  it("calling destroy() twice does not throw", () => {
    createRoot((dispose) => {
      const ctrl = dnd.create();
      ctrl.destroy();
      expect(() => ctrl.destroy()).not.toThrow();
      dispose();
    });
  });

  it("calling cancel() with no active drag is a safe no-op", () => {
    createRoot((dispose) => {
      const ctrl = dnd.create();
      expect(() => ctrl.cancel()).not.toThrow();
      expect(ctrl.isDragging()).toBe(false);
      dispose();
    });
  });
});

describe("dnd safeCall — user callback exception safety", () => {
  // We can't trigger onDragStart/onDrop without DOM, but we can verify the
  // signatures and that mounting + destroy works with hot callbacks set.
  it("create() accepts callbacks that would throw, without observing them", () => {
    createRoot((dispose) => {
      const ctrl = dnd.create({
        onDragStart: () => {
          throw new Error("user code threw in onDragStart");
        },
        onDrop: () => {
          throw new Error("user code threw in onDrop");
        },
        onCancel: () => {
          throw new Error("user code threw in onCancel");
        },
      });
      // Just ensure mount + destroy work cleanly even with throwing callbacks
      // wired up. (Real callback invocations are covered by the dnd directive
      // path which requires a DOM — out of scope for unit tests.)
      expect(() => ctrl.destroy()).not.toThrow();
      dispose();
    });
  });
});
