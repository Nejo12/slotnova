import { describe, expect, it } from "vitest";

import { createTelemetrySink } from "../telemetry.js";

describe("createTelemetrySink", () => {
  it("captures events in strict emission order with a 0-based sequence", () => {
    const sink = createTelemetrySink();
    sink.emit("workspace.created", { workspaceId: "w1" });
    sink.emit("member.invited", { email: "grace@example.test" });
    sink.emit("workspace.created", { workspaceId: "w2" });

    expect(sink.records.map((record) => [record.sequence, record.name])).toEqual([
      [0, "workspace.created"],
      [1, "member.invited"],
      [2, "workspace.created"],
    ]);
  });

  it("uses a deterministic monotonic timestamp by default and honours an injected clock", () => {
    const def = createTelemetrySink();
    def.emit("a");
    def.emit("b");
    expect(def.records[0]?.at).not.toEqual(def.records[1]?.at);
    expect([...def.records].sort((x, y) => x.at.localeCompare(y.at))).toEqual(def.records);

    const fixed = createTelemetrySink({ clock: () => "2026-05-01T00:00:00.000Z" });
    fixed.emit("a");
    expect(fixed.records[0]?.at).toBe("2026-05-01T00:00:00.000Z");
  });

  it("exposes records as a defensive copy and freezes each payload", () => {
    const sink = createTelemetrySink();
    sink.emit("x", { nested: 1 });
    const snapshot = sink.records;
    (snapshot as unknown[]).push({});
    expect(sink.records).toHaveLength(1);
    expect(() => {
      (sink.records[0]?.payload as Record<string, unknown>)["nested"] = 2;
    }).toThrow();
  });

  it("clears all captured records and resets the sequence", () => {
    const sink = createTelemetrySink();
    sink.emit("a");
    sink.emit("b");
    sink.clear();
    expect(sink.records).toHaveLength(0);
    sink.emit("c");
    expect(sink.records[0]?.sequence).toBe(0);
  });

  it("finds and counts events by stable name", () => {
    const sink = createTelemetrySink();
    sink.emit("job.enqueued", { id: 1 });
    sink.emit("job.enqueued", { id: 2 });
    sink.emit("job.completed", { id: 1 });

    expect(sink.count()).toBe(3);
    expect(sink.count("job.enqueued")).toBe(2);
    expect(sink.find("job.enqueued").map((r) => r.payload["id"])).toEqual([1, 2]);
    expect(sink.first("job.completed")?.payload["id"]).toBe(1);
    expect(sink.names()).toEqual(["job.enqueued", "job.completed"]);
  });

  describe("assertions", () => {
    it("assertEmitted returns the first match or throws with a useful message", () => {
      const sink = createTelemetrySink();
      sink.emit("outbox.published", { eventId: "e1" });
      expect(sink.assertEmitted("outbox.published").payload["eventId"]).toBe("e1");
      expect(() => sink.assertEmitted("outbox.failed")).toThrow(
        /Expected telemetry event "outbox.failed" to be emitted.*Captured \(in order\): \[0:outbox\.published\]/s,
      );
    });

    it("assertEmittedTimes checks an exact count", () => {
      const sink = createTelemetrySink();
      sink.emit("retry");
      sink.emit("retry");
      expect(() => sink.assertEmittedTimes("retry", 2)).not.toThrow();
      expect(() => sink.assertEmittedTimes("retry", 1)).toThrow(/emitted 2 time\(s\)/);
    });

    it("assertNotEmitted passes on absence and reports offending sequences otherwise", () => {
      const sink = createTelemetrySink();
      expect(() => sink.assertNotEmitted("never")).not.toThrow();
      sink.emit("side.effect");
      expect(() => sink.assertNotEmitted("side.effect")).toThrow(/at sequence 0/);
    });

    it("reports that nothing was captured when the buffer is empty", () => {
      const sink = createTelemetrySink();
      expect(() => sink.assertEmitted("anything")).toThrow(/No telemetry events were captured/);
    });
  });
});
