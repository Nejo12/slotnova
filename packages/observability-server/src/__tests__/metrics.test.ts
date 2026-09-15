import { describe, expect, it } from "vitest";

import {
  createBusinessMeter,
  createInMemoryExporter,
  createMeter,
  createNoopExporter,
  createTechnicalMeter,
  TECHNICAL_METRIC_NAMES,
} from "../metrics.js";

describe("metrics", () => {
  it("records a counter as one exported point with kind and value", () => {
    const exporter = createInMemoryExporter();
    const meter = createMeter({ namespace: "technical", exporter, clock: () => "t-0" });
    meter.counter(TECHNICAL_METRIC_NAMES.httpRequestsTotal).add(1, { route: "/healthz" });

    expect(exporter.points).toEqual([
      {
        namespace: "technical",
        name: TECHNICAL_METRIC_NAMES.httpRequestsTotal,
        kind: "counter",
        value: 1,
        attributes: { route: "/healthz" },
        at: "t-0",
      },
    ]);
  });

  it("records a histogram observation", () => {
    const exporter = createInMemoryExporter();
    const meter = createMeter({ namespace: "technical", exporter, clock: () => "t-0" });
    meter.histogram(TECHNICAL_METRIC_NAMES.httpRequestDurationMs).record(42);
    expect(exporter.points[0]).toMatchObject({ kind: "histogram", value: 42 });
  });

  it("records a gauge set", () => {
    const exporter = createInMemoryExporter();
    const meter = createMeter({ namespace: "technical", exporter, clock: () => "t-0" });
    meter.gauge(TECHNICAL_METRIC_NAMES.outboxQueueDepth).set(7);
    expect(exporter.points[0]).toMatchObject({ kind: "gauge", value: 7 });
  });

  it("keeps technical and business namespaces structurally distinct", () => {
    const exporter = createInMemoryExporter();
    createTechnicalMeter(exporter).counter("requests").add(1);
    createBusinessMeter(exporter).counter("recovery.completed").add(1);

    expect(exporter.points.map((point) => point.namespace)).toEqual(["technical", "business"]);
  });

  it("defines no business metric content — only the reserved namespace factory", () => {
    const exporter = createInMemoryExporter();
    const meter = createBusinessMeter(exporter);
    expect(meter.namespace).toBe("business");
    // PR-18 invents no business metric names; nothing pre-registered to emit.
    expect(exporter.points).toEqual([]);
  });

  it.each([
    "requestId",
    "correlationId",
    "workspaceId",
    "userId",
    "jobId",
    "invitationId",
    "membershipId",
    "traceId",
    "email",
    "token",
  ])("refuses a high-cardinality/sensitive label %j", (key) => {
    const meter = createMeter({ namespace: "technical", exporter: createInMemoryExporter() });
    expect(() => meter.counter("x").add(1, { [key]: "value" })).toThrow(
      /high-cardinality|sensitive/,
    );
  });

  it("allows low-cardinality labels such as route, method, and outcome", () => {
    const exporter = createInMemoryExporter();
    const meter = createMeter({ namespace: "technical", exporter });
    expect(() =>
      meter.counter(TECHNICAL_METRIC_NAMES.httpErrorsTotal).add(1, {
        route: "/v1/invitations",
        method: "POST",
        outcome: "error",
        status: 500,
      }),
    ).not.toThrow();
    expect(exporter.points).toHaveLength(1);
  });

  it("defaults to a no-op exporter requiring no network access", () => {
    const meter = createTechnicalMeter();
    expect(() => meter.counter(TECHNICAL_METRIC_NAMES.httpRequestsTotal).add(1)).not.toThrow();
  });

  it("createNoopExporter discards every point", () => {
    const exporter = createNoopExporter();
    expect(() => exporter.export([])).not.toThrow();
  });

  it("clear() resets the in-memory exporter", () => {
    const exporter = createInMemoryExporter();
    const meter = createMeter({ namespace: "technical", exporter });
    meter.counter("x").add(1);
    expect(exporter.points).toHaveLength(1);
    exporter.clear();
    expect(exporter.points).toEqual([]);
  });
});
