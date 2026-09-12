import { Client } from "@slotnova/db";
import { runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeOutboxRecord } from "../outbox-writer.js";

/**
 * T024 — real-PostgreSQL outbox writer atomicity (SC-009 writer half).
 *
 * Proves the CRITICAL invariant from ADR-005/T022: a business-table write and
 * the outbox write in the SAME transaction commit or roll back together. No
 * mocks, spies, in-memory DB, or same-connection-only visibility checks — an
 * independent connection observes the actual committed/rolled-back state.
 *
 * `widgets` here is a test-only fixture table representing "a business state
 * write" (T024 explicitly permits this rather than a product-domain table).
 */
describe("outbox writer atomicity (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });

    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    await admin.query(`
      CREATE TABLE widgets (
        id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL
      )
    `);
    await admin.query(`GRANT SELECT, INSERT ON widgets TO ${harness.appRole}`);
  }, 120_000);

  afterAll(async () => {
    await admin.end();
    await harness.stop();
  });

  it("commits the business write and the outbox row together", async () => {
    const appConn = new Client({ connectionString: harness.appUri });
    await appConn.connect();
    try {
      await appConn.query("BEGIN");
      const { rows } = await appConn.query<{ id: string }>(
        "INSERT INTO widgets (name) VALUES ($1) RETURNING id",
        ["committed-widget"],
      );
      const widgetId = rows[0]!.id;

      const outboxRecord = await writeOutboxRecord(appConn, {
        eventName: "platform.widget_created",
        payload: { requestId: "req-commit-1", widgetId },
      });

      await appConn.query("COMMIT");

      // Independent connection — never the one that ran the transaction.
      const observer = new Client({ connectionString: harness.appUri });
      await observer.connect();
      try {
        const widgetRows = await observer.query("SELECT id, name FROM widgets WHERE id = $1", [
          widgetId,
        ]);
        expect(widgetRows.rows).toHaveLength(1);

        const outboxRows = await observer.query(
          "SELECT id, event_name, payload FROM public.outbox_records WHERE id = $1",
          [outboxRecord.id],
        );
        expect(outboxRows.rows).toHaveLength(1);
        expect(outboxRows.rows[0].event_name).toBe("platform.widget_created");
        expect(outboxRows.rows[0].payload).toMatchObject({ requestId: "req-commit-1", widgetId });
      } finally {
        await observer.end();
      }
    } finally {
      await appConn.end();
    }
  });

  it("rolls back the business write and the outbox row together — neither is visible", async () => {
    const appConn = new Client({ connectionString: harness.appUri });
    await appConn.connect();
    let widgetId: string;
    let outboxId: string;
    try {
      await appConn.query("BEGIN");
      const { rows } = await appConn.query<{ id: string }>(
        "INSERT INTO widgets (name) VALUES ($1) RETURNING id",
        ["rolled-back-widget"],
      );
      widgetId = rows[0]!.id;

      const outboxRecord = await writeOutboxRecord(appConn, {
        eventName: "platform.widget_created",
        payload: { requestId: "req-rollback-1", widgetId },
      });
      outboxId = outboxRecord.id;

      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }

    const observer = new Client({ connectionString: harness.appUri });
    await observer.connect();
    try {
      const widgetRows = await observer.query("SELECT id FROM widgets WHERE id = $1", [widgetId]);
      expect(widgetRows.rows).toHaveLength(0);

      const outboxRows = await observer.query(
        "SELECT id FROM public.outbox_records WHERE id = $1",
        [outboxId],
      );
      expect(outboxRows.rows).toHaveLength(0);
    } finally {
      await observer.end();
    }
  });

  it("rejects a blank event name before touching the database", async () => {
    const appConn = new Client({ connectionString: harness.appUri });
    await appConn.connect();
    try {
      await appConn.query("BEGIN");
      await expect(
        writeOutboxRecord(appConn, { eventName: "  ", payload: { requestId: "req-x" } }),
      ).rejects.toThrow(/eventName must not be blank/);
      await appConn.query("ROLLBACK");
    } finally {
      await appConn.end();
    }
  });
});
