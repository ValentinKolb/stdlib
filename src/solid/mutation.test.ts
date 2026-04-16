import { describe, it, expect, mock } from "bun:test";
import { mutation } from "./mutation";
import { testRoot } from "../_test-helpers";

// ==========================
// Initial state
// ==========================

describe("mutation.create", () => {
  it("initial state: data=null, error=null, loading=false", () => {
    const { result: m, dispose } = testRoot(() =>
      mutation.create({ mutation: async () => 42 }),
    );
    expect(m.data()).toBeNull();
    expect(m.error()).toBeNull();
    expect(m.loading()).toBe(false);
    dispose();
  });

  it("initial state with initialData", () => {
    const { result: m, dispose } = testRoot(() =>
      mutation.create({ mutation: async () => 42, initialData: 10 }),
    );
    expect(m.data()).toBe(10);
    dispose();
  });

  // ==========================
  // mutate
  // ==========================

  it("mutate resolves to data", async () => {
    const { result: m, dispose } = testRoot(() =>
      mutation.create({ mutation: async () => 42 }),
    );
    await m.mutate(undefined as any);
    expect(m.data()).toBe(42);
    expect(m.loading()).toBe(false);
    expect(m.error()).toBeNull();
    dispose();
  });

  it("mutate sets error on failure", async () => {
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        mutation: async () => {
          throw new Error("boom");
        },
      }),
    );
    await m.mutate(undefined as any);
    expect(m.error()?.message).toBe("boom");
    expect(m.data()).toBeNull();
    dispose();
  });

  // ==========================
  // Lifecycle hooks
  // ==========================

  it("onBefore is called before mutation", async () => {
    const log: string[] = [];
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        onBefore: () => {
          log.push("before");
          return { x: 1 };
        },
        mutation: async () => {
          log.push("mutation");
          return 1;
        },
      }),
    );
    await m.mutate(undefined as any);
    expect(log).toEqual(["before", "mutation"]);
    dispose();
  });

  it("onBefore context is passed to mutation", async () => {
    let receivedCtx: any = null;
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        onBefore: () => ({ extra: "data" }),
        mutation: async (_vars, ctx) => {
          receivedCtx = ctx;
          return 1;
        },
      }),
    );
    await m.mutate(undefined as any);
    expect(receivedCtx.extra).toBe("data");
    expect(receivedCtx.abortSignal).toBeInstanceOf(AbortSignal);
    dispose();
  });

  it("onSuccess is called on success", async () => {
    const onSuccess = mock(() => {});
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        mutation: async () => 42,
        onSuccess,
      }),
    );
    await m.mutate(undefined as any);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("onError is called on mutation failure", async () => {
    const onError = mock(() => {});
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        mutation: async () => {
          throw new Error("fail");
        },
        onError,
      }),
    );
    await m.mutate(undefined as any);
    expect(onError).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("onFinally is called regardless of outcome", async () => {
    const onFinally = mock(() => {});

    // Success case
    const { result: m1, dispose: d1 } = testRoot(() =>
      mutation.create({ mutation: async () => 1, onFinally }),
    );
    await m1.mutate(undefined as any);
    expect(onFinally).toHaveBeenCalledTimes(1);
    d1();

    // Error case
    const onFinally2 = mock(() => {});
    const { result: m2, dispose: d2 } = testRoot(() =>
      mutation.create({
        mutation: async () => {
          throw new Error("x");
        },
        onFinally: onFinally2,
      }),
    );
    await m2.mutate(undefined as any);
    expect(onFinally2).toHaveBeenCalledTimes(1);
    d2();
  });

  // ==========================
  // retry
  // ==========================

  it("retry re-executes with same vars", async () => {
    let callCount = 0;
    const { result: m, dispose } = testRoot(() =>
      mutation.create<number, string>({
        mutation: async (vars) => {
          callCount++;
          if (callCount === 1) throw new Error("first fail");
          return 42;
        },
      }),
    );
    await m.mutate("input");
    expect(m.error()).not.toBeNull();

    await m.retry();
    expect(m.data()).toBe(42);
    expect(m.error()).toBeNull();
    dispose();
  });

  it("retry does NOT call onBefore again", async () => {
    const onBefore = mock(() => ({}));
    let callCount = 0;
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        onBefore,
        mutation: async () => {
          callCount++;
          if (callCount === 1) throw new Error("fail");
          return 1;
        },
      }),
    );
    await m.mutate(undefined as any);
    expect(onBefore).toHaveBeenCalledTimes(1);

    await m.retry();
    // onBefore should still have been called only once
    expect(onBefore).toHaveBeenCalledTimes(1);
    dispose();
  });

  // ==========================
  // Function-valued data
  // ==========================

  it("handles function-valued data without SolidJS treating it as updater", async () => {
    const myFn = () => "hello";
    const { result: m, dispose } = testRoot(() =>
      mutation.create({
        mutation: async () => myFn,
      }),
    );
    await m.mutate(undefined as any);
    expect(m.data()).toBe(myFn);
    expect(m.data()!()).toBe("hello");
    dispose();
  });
});
