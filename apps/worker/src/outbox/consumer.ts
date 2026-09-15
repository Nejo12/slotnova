import type { Pool } from "@slotnova/db";
import { runWithChildContext, type Logger } from "@slotnova/observability-server";
import { claim, openClaimSession } from "./claim.js";
import { dispatch, eventRequestId, type OutboxHandler } from "./dispatch.js";
import { handleIdentityEvent } from "./handlers/identity.js";

export interface ConsumerOptions {
  pool: Pool;
  logger: Logger;
  instanceId: string;
  batchSize: number;
  maxAttempts: number;
  pollIntervalMs: number;
  handler?: OutboxHandler;
}

export async function startConsumer(options: ConsumerOptions) {
  const { client, owner } = await openClaimSession(options.pool, options.instanceId);
  let stopping = false;
  let cursor: string | null = null;
  let connectionError: Error | undefined;
  let wake: (() => void) | undefined;
  // A lost ownership session is fatal: never reconnect it under the same owner.
  client.on("error", (error: Error) => {
    connectionError = error;
    stopping = true;
    wake?.();
  });
  const done = (async () => {
    try {
      while (!stopping) {
        const batch = await claim(client, owner, options.batchSize, options.maxAttempts, cursor);
        cursor = batch.cursor;
        const records = batch.records;
        for (const record of records) {
          if (stopping) break;
          try {
            await dispatch(record, client, options.handler ?? handleIdentityEvent, options.logger);
          } catch {
            await client.query(
              `UPDATE public.outbox_records SET claimed_at = NULL, claimed_by = NULL,
              dead_lettered_at = CASE WHEN attempts >= $3 THEN clock_timestamp() ELSE NULL END,
              available_at = clock_timestamp() + $4 * interval '1 millisecond'
              WHERE id = $1 AND claimed_by = $2 AND processed_at IS NULL`,
              [record.id, owner, options.maxAttempts, options.pollIntervalMs],
            );
            runWithChildContext(
              {
                correlationId: eventRequestId(record) ?? record.id,
                requestId: eventRequestId(record) ?? record.id,
              },
              () => {
                options.logger.warn("outbox.retry_or_dead_letter", {
                  meta: { eventId: record.id, attempt: record.attempts },
                });
              },
            );
            continue;
          }
          await client.query(
            `UPDATE public.outbox_records SET processed_at = clock_timestamp(),
            claimed_at = NULL, claimed_by = NULL WHERE id = $1 AND claimed_by = $2`,
            [record.id, owner],
          );
        }
        if (!stopping)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              wake = undefined;
              resolve();
            }, options.pollIntervalMs);
            wake = () => {
              clearTimeout(timer);
              wake = undefined;
              resolve();
            };
          });
      }
      if (connectionError) throw connectionError;
    } finally {
      // Destroy rather than pool this dedicated session: releases all session
      // advisory locks even after failures. Remaining claimed rows are recoverable.
      client.release(true);
    }
  })();
  // Attach immediately so an asynchronous failure is never an unhandled rejection.
  void done.catch(() => options.logger.error("outbox.consumer_failed"));
  return {
    done,
    stop: async () => {
      stopping = true;
      wake?.();
      await done;
    },
  };
}
