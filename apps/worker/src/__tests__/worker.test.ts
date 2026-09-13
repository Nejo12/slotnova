import { describe, expect, it, vi } from "vitest";

import { createWorker } from "../worker.js";

/**
 * T025 worker smoke test. Proves the skeleton starts cleanly, emits exactly
 * one structured ready log through `@slotnova/observability-server`, and
 * stops cleanly without leaving the process alive (no outbox/scheduler
 * behavior belongs here — that is PR-16 / T068-T071).
 */
describe("worker skeleton (T025)", () => {
  it("emits a single structured ready log on start", () => {
    const lines: string[] = [];
    const worker = createWorker({ sink: (line) => lines.push(line) });

    worker.start();

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] as string) as { event: string; service: string };
    expect(record.event).toBe("worker.ready");
    expect(record.service).toBe("worker");

    worker.stop();
  });

  it("stop() is idempotent and emits no further log lines", () => {
    const lines: string[] = [];
    const worker = createWorker({ sink: (line) => lines.push(line) });

    worker.start();
    worker.stop();
    worker.stop();

    expect(lines).toHaveLength(1);
  });

  it("keeps a ref'd keep-alive timer so the process does not exit on its own", () => {
    const realSetInterval = global.setInterval;
    let capturedTimer: NodeJS.Timeout | undefined;
    vi.spyOn(global, "setInterval").mockImplementation(((
      ...args: Parameters<typeof setInterval>
    ) => {
      capturedTimer = realSetInterval(...args);
      return capturedTimer;
    }) as typeof setInterval);

    const worker = createWorker({ sink: () => {} });
    worker.start();

    expect(capturedTimer?.hasRef()).toBe(true);

    worker.stop();
    vi.restoreAllMocks();
  });
});
