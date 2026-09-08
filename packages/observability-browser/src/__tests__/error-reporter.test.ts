import { describe, expect, it, vi } from "vitest";

import { createErrorReporter, type Report } from "../error-reporter.js";
import { createInMemorySink } from "./in-memory-sink.js";

function setup(configOverrides: Partial<Parameters<typeof createErrorReporter>[0]> = {}) {
  const sink = createInMemorySink();
  const reporter = createErrorReporter({
    sink,
    release: "1.4.2+abc123",
    environment: "production",
    clock: () => "2026-09-08T00:00:00.000Z",
    ...configOverrides,
  });
  return { sink, reporter };
}

describe("createErrorReporter", () => {
  it("normalizes a thrown Error into name / message / stack", () => {
    const { sink, reporter } = setup();
    reporter.reportError(new TypeError("bad input"));

    const report = sink.reports[0] as Extract<Report, { kind: "error" }>;
    expect(report.error.name).toBe("TypeError");
    expect(report.error.message).toBe("bad input");
    expect(typeof report.error.stack).toBe("string");
  });

  it("normalizes a non-Error thrown value", () => {
    const { sink, reporter } = setup();
    reporter.reportError("just a string");
    reporter.reportError({ weird: true });

    const first = sink.reports[0] as Extract<Report, { kind: "error" }>;
    const second = sink.reports[1] as Extract<Report, { kind: "error" }>;
    expect(first.error).toMatchObject({ name: "Error", message: "just a string" });
    expect(second.error.message).toContain("weird");
  });

  it("attaches release and environment context to every report", () => {
    const { sink, reporter } = setup();
    reporter.reportError(new Error("a"));
    reporter.reportMessage("something happened");

    for (const report of sink.reports) {
      expect(report.release).toBe("1.4.2+abc123");
      expect(report.environment).toBe("production");
      expect(report.timestamp).toBe("2026-09-08T00:00:00.000Z");
    }
  });

  it("passes explicit correlation / trace context through when supplied", () => {
    const { sink, reporter } = setup();
    reporter.reportError(new Error("a"), {
      correlation: { correlationId: "c-1", traceId: "t-1" },
    });
    const report = sink.reports[0] as Report;
    expect(report.correlation).toEqual({ correlationId: "c-1", traceId: "t-1" });
  });

  it("omits correlation when the caller does not supply it", () => {
    const { sink, reporter } = setup();
    reporter.reportError(new Error("a"));
    expect(Object.hasOwn(sink.reports[0] as object, "correlation")).toBe(false);
  });

  it("does not mutate the caller-owned metadata object", () => {
    const { reporter } = setup();
    const metadata = { view: "checkout", nested: { attempt: 1 } };
    const snapshot = structuredClone(metadata);
    reporter.reportError(new Error("a"), { metadata });
    expect(metadata).toEqual(snapshot);
  });

  it("normalizes metadata: drops functions and undefined, handles nesting and cycles", () => {
    const { sink, reporter } = setup();
    const cyclic: Record<string, unknown> = { label: "root" };
    cyclic["self"] = cyclic;
    reporter.reportError(new Error("a"), {
      metadata: {
        keep: 1,
        fn: () => 0,
        missing: undefined,
        nested: { ok: true },
        cyclic,
      },
    });
    const report = sink.reports[0] as Report;
    expect(report.metadata).toEqual({
      keep: 1,
      nested: { ok: true },
      cyclic: { label: "root", self: "[CIRCULAR]" },
    });
  });

  it("delivers the expected payload shape to the sink", () => {
    const { sink, reporter } = setup();
    reporter.reportError(new Error("boom"), { metadata: { a: 1 } });
    expect(sink.reports[0]).toEqual({
      kind: "error",
      error: { name: "Error", message: "boom", stack: expect.any(String) },
      release: "1.4.2+abc123",
      environment: "production",
      timestamp: "2026-09-08T00:00:00.000Z",
      metadata: { a: 1 },
    });
  });

  it("reportMessage produces a message report with a level", () => {
    const { sink, reporter } = setup();
    reporter.reportMessage("cache miss", { level: "warning" });
    expect(sink.reports[0]).toMatchObject({
      kind: "message",
      message: "cache miss",
      level: "warning",
      environment: "production",
    });
  });

  it("contains a sink that throws synchronously and forwards it to onReportFailure", () => {
    const onReportFailure = vi.fn();
    const reporter = createErrorReporter({
      sink: {
        send() {
          throw new Error("provider down");
        },
      },
      release: "r",
      environment: "e",
      onReportFailure,
    });
    expect(() => reporter.reportError(new Error("a"))).not.toThrow();
    expect(onReportFailure).toHaveBeenCalledOnce();
  });

  it("contains a sink that rejects without an unhandled rejection", async () => {
    const onReportFailure = vi.fn();
    const reporter = createErrorReporter({
      sink: { send: () => Promise.reject(new Error("async provider down")) },
      release: "r",
      environment: "e",
      onReportFailure,
    });
    reporter.reportError(new Error("a"));
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(onReportFailure).toHaveBeenCalledOnce();
  });
});
