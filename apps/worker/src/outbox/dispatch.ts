import type { PoolClient } from "@slotnova/db";
import { runWithChildContext, type Logger } from "@slotnova/observability-server";
import type { OutboxRecord } from "./claim.js";

/** Implementations must deduplicate durable effects by record.id, atomically
 * with the effect, or use the downstream provider's idempotency key. */
export type OutboxHandler = (record: OutboxRecord, client: PoolClient) => Promise<void>;

export function eventRequestId(record: OutboxRecord): string | undefined {
  const payload: unknown = record.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>)["requestId"];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function dispatch(
  record: OutboxRecord,
  client: PoolClient,
  handler: OutboxHandler,
  logger: Logger,
): Promise<void> {
  const requestId = eventRequestId(record);
  if (typeof requestId !== "string" || !requestId.trim())
    throw new Error("outbox requestId missing");
  await runWithChildContext(
    { correlationId: requestId, requestId, workspaceId: record.workspace_id ?? undefined },
    async () => {
      // Session-local context is reset before the connection is reused/released.
      await client.query(
        "SELECT set_config('app.workspace_id', $1, false), set_config('app.request_id', $2, false)",
        [record.workspace_id ?? "", requestId],
      );
      try {
        logger.info("outbox.dispatch", {
          meta: { eventId: record.id, eventName: record.event_name, attempt: record.attempts },
        });
        await handler(record, client);
        logger.info("outbox.handled", { meta: { eventId: record.id } });
      } catch (error) {
        logger.error("outbox.handler_failed", {
          meta: { eventId: record.id, attempt: record.attempts },
        });
        throw error;
      } finally {
        await client.query("RESET app.workspace_id; RESET app.request_id");
      }
    },
  );
}
