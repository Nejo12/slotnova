import { describe, expect, it } from "vitest";

import { runWithContext } from "../als-context.js";
import { REDACTED } from "../redaction.js";
import { createLogger, type LogRecord } from "../logger.js";

/** A logger whose records are captured as parsed objects for assertions. */
function testLogger(overrides: Parameters<typeof createLogger>[0] = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    sink: (line) => lines.push(line),
    clock: () => "2026-09-08T00:00:00.000Z",
    ...overrides,
  });
  const records = (): LogRecord[] => lines.map((line) => JSON.parse(line) as LogRecord);
  return { logger, lines, records };
}

describe("createLogger", () => {
  it("emits one structured JSON record per call with level, time and event", () => {
    const { logger, lines, records } = testLogger();
    logger.info("workspace.created");

    expect(lines).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      level: "info",
      time: "2026-09-08T00:00:00.000Z",
      event: "workspace.created",
    });
  });

  it("passes the event name through verbatim (stable event names)", () => {
    const { logger, records } = testLogger();
    logger.warn("recovery.offer_expired");
    expect(records()[0]?.event).toBe("recovery.offer_expired");
  });

  it("produces parseable JSON and nothing else on the line", () => {
    const { logger, lines } = testLogger();
    logger.error("payment.capture_failed", { message: "declined" });
    expect(() => JSON.parse(lines[0] ?? "")).not.toThrow();
    expect(lines[0]).toBe(JSON.stringify(JSON.parse(lines[0] ?? "")));
  });

  it("attaches correlation context to every record when a context is active", () => {
    const { logger, records } = testLogger();
    runWithContext({ correlationId: "c-1", workspaceId: "w-1", userId: "u-1" }, () => {
      logger.info("a.one");
      logger.info("a.two");
    });
    for (const record of records()) {
      expect(record.correlationId).toBe("c-1");
      expect(record.workspaceId).toBe("w-1");
      expect(record.userId).toBe("u-1");
    }
  });

  it("omits correlation fields deterministically when no context is active", () => {
    const { logger, records } = testLogger();
    logger.info("a.no_context");
    const record = records()[0] as LogRecord;
    expect(record.correlationId).toBeUndefined();
    expect(Object.hasOwn(record, "correlationId")).toBe(false);
    expect(record).toMatchObject({ level: "info", event: "a.no_context" });
  });

  it("redacts sensitive metadata, including nested objects and arrays", () => {
    const { logger, records } = testLogger();
    logger.info("http.request", {
      meta: {
        route: "/login",
        body: { password: "hunter2", tokens: [{ accessToken: "x" }] },
      },
    });
    expect(records()[0]?.meta).toEqual({
      route: "/login",
      body: { password: REDACTED, tokens: [{ accessToken: REDACTED }] },
    });
  });

  it("does not mutate the caller-owned metadata object", () => {
    const { logger } = testLogger();
    const meta = { password: "p", nested: { apiKey: "k" } };
    const snapshot = structuredClone(meta);
    logger.info("x.y", { meta });
    expect(meta).toEqual(snapshot);
  });

  it("redacts static base fields too", () => {
    const { logger, records } = testLogger({ base: { service: "api", apiKey: "leaked" } });
    logger.info("boot.ok");
    expect(records()[0]).toMatchObject({ service: "api", apiKey: REDACTED });
  });

  it("drops records below the configured minimum level", () => {
    const { logger, lines } = testLogger({ level: "warn" });
    logger.debug("nope");
    logger.info("nope");
    logger.warn("yes");
    logger.error("yes");
    expect(lines).toHaveLength(2);
  });

  it("includes a message only when one is supplied", () => {
    const { logger, records } = testLogger();
    logger.info("with.msg", { message: "hello" });
    logger.info("without.msg");
    expect(records()[0]?.message).toBe("hello");
    expect(Object.hasOwn(records()[1] as object, "message")).toBe(false);
  });

  it("emits a serialization-failure record instead of throwing on a bad sink payload", () => {
    const { logger, records } = testLogger();
    expect(() => logger.info("weird", { meta: { big: 10n } })).not.toThrow();
    expect(records()[0]?.event).toBe("observability.log_serialization_failed");
  });
});
