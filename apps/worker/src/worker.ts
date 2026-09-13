/**
 * Minimal runnable worker skeleton (T025, PR-06). Starts cleanly, emits one
 * structured ready log through `@slotnova/observability-server`, and stays
 * alive with a no-op keep-alive until stopped. No outbox consumer, scheduler,
 * polling, retries or product handlers here — that is PR-16 (T068-T071).
 */

import { createLogger, type Logger, type LoggerOptions } from "@slotnova/observability-server";

export interface WorkerOptions {
  /** Forwarded to the observability logger; lets tests capture emitted lines. */
  sink?: LoggerOptions["sink"];
  logger?: Logger;
}

export interface Worker {
  start(): void;
  stop(): void;
}

const KEEP_ALIVE_INTERVAL_MS = 60_000;

export function createWorker(options: WorkerOptions = {}): Worker {
  const logger =
    options.logger ??
    createLogger({
      base: { service: "worker" },
      ...(options.sink !== undefined ? { sink: options.sink } : {}),
    });
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  return {
    start(): void {
      if (keepAlive !== undefined) return;
      logger.info("worker.ready");
      // Deliberately ref'd (not `.unref()`'d): a skeleton worker with nothing
      // else running must still stay alive until an explicit `stop()` or
      // shutdown signal — PR-16's outbox consumer loop replaces this timer.
      keepAlive = setInterval(() => {
        /* no-op keep-alive; PR-16 replaces this with the outbox consumer loop */
      }, KEEP_ALIVE_INTERVAL_MS);
    },
    stop(): void {
      if (keepAlive === undefined) return;
      clearInterval(keepAlive);
      keepAlive = undefined;
    },
  };
}
