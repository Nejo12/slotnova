import { describe, expect, it } from "vitest";

import { meKey, wsKey } from "../keys.js";

describe("query key factory (ADR-003: workspace-scoped keys)", () => {
  it("meKey is a stable, non-workspace-scoped key", () => {
    expect(meKey()).toEqual(["me"]);
  });

  it("wsKey always starts with the literal 'ws' and includes workspaceId", () => {
    const key = wsKey("workspace-1", "foo", "bar");
    expect(key[0]).toBe("ws");
    expect(key[1]).toBe("workspace-1");
    expect(key).toEqual(["ws", "workspace-1", "foo", "bar"]);
  });

  it("wsKey with no extra segments still includes workspaceId", () => {
    expect(wsKey("workspace-1")).toEqual(["ws", "workspace-1"]);
  });

  it("different workspaceIds produce different keys for the same resource", () => {
    const a = wsKey("workspace-a", "clients");
    const b = wsKey("workspace-b", "clients");
    expect(a).not.toEqual(b);
  });
});
