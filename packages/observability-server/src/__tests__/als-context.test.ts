import { describe, expect, it } from "vitest";

import {
  createCorrelationContext,
  getContext,
  getCorrelationId,
  runWithChildContext,
  runWithContext,
} from "../als-context.js";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));

describe("correlation context", () => {
  it("has no context outside runWithContext", () => {
    expect(getContext()).toBeUndefined();
    expect(getCorrelationId()).toBeUndefined();
  });

  it("exposes the active context inside runWithContext", () => {
    runWithContext({ correlationId: "c-1", workspaceId: "w-1" }, () => {
      expect(getContext()).toEqual({ correlationId: "c-1", workspaceId: "w-1" });
      expect(getCorrelationId()).toBe("c-1");
    });
  });

  it("propagates context across await boundaries", async () => {
    await runWithContext({ correlationId: "c-await" }, async () => {
      await tick();
      expect(getCorrelationId()).toBe("c-await");
      await tick();
      expect(getCorrelationId()).toBe("c-await");
    });
  });

  it("keeps concurrent async flows isolated", async () => {
    const flow = (id: string): Promise<string | undefined> =>
      runWithContext({ correlationId: id }, async () => {
        await tick();
        return getCorrelationId();
      });

    const results = await Promise.all([flow("a"), flow("b"), flow("c")]);
    expect(results).toEqual(["a", "b", "c"]);
  });

  it("does not leak context after runWithContext returns", async () => {
    await runWithContext({ correlationId: "c-gone" }, async () => {
      await tick();
    });
    expect(getContext()).toBeUndefined();
  });

  it("runWithChildContext inherits and overrides without touching the parent", () => {
    runWithContext({ correlationId: "c-1", workspaceId: "w-1" }, () => {
      runWithChildContext({ userId: "u-9", workspaceId: "w-2" }, () => {
        expect(getContext()).toEqual({
          correlationId: "c-1",
          workspaceId: "w-2",
          userId: "u-9",
        });
      });
      expect(getContext()).toEqual({ correlationId: "c-1", workspaceId: "w-1" });
    });
  });

  it("runWithChildContext outside any parent still establishes a context", () => {
    runWithChildContext({ correlationId: "c-new" }, () => {
      expect(getCorrelationId()).toBe("c-new");
    });
  });

  it("createCorrelationContext generates a correlation id when none is supplied", () => {
    const ctx = createCorrelationContext();
    expect(ctx.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("createCorrelationContext preserves a supplied correlation id and known fields", () => {
    const ctx = createCorrelationContext({
      correlationId: "given",
      traceId: "t-1",
      userId: "u-1",
    });
    expect(ctx).toEqual({ correlationId: "given", traceId: "t-1", userId: "u-1" });
  });

  it("createCorrelationContext drops undefined optional fields", () => {
    const ctx = createCorrelationContext({ correlationId: "c", workspaceId: undefined });
    expect(Object.hasOwn(ctx, "workspaceId")).toBe(false);
  });
});
