import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { activeServicesKey, bookingKey, serviceKey } from "../api/keys.js";

describe("Booking/Catalog cache scoping", () => {
  it("scopes every key to the active workspace", () => {
    expect(activeServicesKey("ws-1")).toEqual(["ws", "ws-1", "catalog", "services", "active"]);
    expect(serviceKey("ws-1", "svc-1")).toEqual(["ws", "ws-1", "catalog", "services", "svc-1"]);
    expect(bookingKey("ws-1", "bk-1")).toEqual(["ws", "ws-1", "booking", "bookings", "bk-1"]);
  });

  it("never collides across workspaces for the same booking id", () => {
    expect(bookingKey("ws-1", "bk-1")).not.toEqual(bookingKey("ws-2", "bk-1"));
  });

  it("is removed by the workspace-switch cache clear the shell performs", () => {
    const client = new QueryClient();
    client.setQueryData(bookingKey("ws-1", "bk-1"), { id: "bk-1" });
    client.setQueryData(activeServicesKey("ws-1"), { items: [] });
    expect(client.getQueryData(bookingKey("ws-1", "bk-1"))).toBeDefined();

    // Exactly what `useWorkspaceSwitch`/`useLogout` do.
    client.clear();

    expect(client.getQueryData(bookingKey("ws-1", "bk-1"))).toBeUndefined();
    expect(client.getQueryData(activeServicesKey("ws-1"))).toBeUndefined();
  });
});
