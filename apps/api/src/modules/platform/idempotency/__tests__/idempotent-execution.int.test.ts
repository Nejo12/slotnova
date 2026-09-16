import { Client, DEFAULT_MIGRATIONS_DIR, Pool, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertCleanMigration,
  assertForwardMigration,
  assertRlsCoverage,
  openIndependentConnections,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../../tenancy/with-workspace-context.js";
import { IdempotencyConflictError } from "../idempotency-errors.js";
import { executeIdempotently } from "../idempotent-execution.js";
import { fingerprintRequest } from "../request-fingerprint.js";

/**
 * Issue #61 (Phase 2 PR-02A) — durable API idempotency foundation, proved
 * against real PostgreSQL. Not a single line here is Catalog-specific: the
 * `operation` string below is an arbitrary example a future consumer would
 * supply.
 *
 * `executeIdempotently` is the ONLY supported entry point (correctness
 * repair, independent review): the claim, the business mutation, and the
 * completion write always happen inside one caller-supplied transaction.
 * There is no split-transaction claim/complete API to test here — it was
 * removed for an unsafe completion-fencing gap.
 */
describe("idempotent_requests migration (real PostgreSQL)", () => {
  let harness: PostgresHarness;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
  }, 180_000);

  afterAll(async () => {
    await harness.stop();
  });

  it("applies cleanly to an empty database and is idempotent", async () => {
    const result = await assertCleanMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
    });
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0007"]));
  });

  it("applies forward onto a populated prior state without data loss", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0007",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.outbox_records (event_name, payload)
           VALUES ('platform.pre_idempotency_marker', '{"requestId":"req-forward-idem-1"}'::jsonb)
           RETURNING id`,
        );
        return rows[0]!.id;
      },
      verify: async (client, seededId) => {
        const { rows } = await client.query("SELECT id FROM public.outbox_records WHERE id = $1", [
          seededId,
        ]);
        expect(rows).toHaveLength(1);
      },
    });
  });

  it("has RLS enabled + forced + policy on idempotent_requests", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(
        assertRlsCoverage(admin, [{ schema: "public", table: "idempotent_requests" }]),
      ).resolves.toHaveLength(1);
    } finally {
      await admin.end();
    }
  });
});

describe("idempotent execution semantics (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let workspaceAId: string;
  let workspaceBId: string;

  const OPERATION = "example.create_widget";

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    const a = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Idem WS A', 'idem-ws-a') RETURNING id`,
    );
    workspaceAId = a.rows[0]!.id;
    const b = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Idem WS B', 'idem-ws-b') RETURNING id`,
    );
    workspaceBId = b.rows[0]!.id;

    pool = new Pool({ connectionString: harness.appUri });
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("runs the business callback exactly once for the same key/scope/fingerprint, then replays", async () => {
    const key = "req-key-001";
    const payload = { name: "Widget A" };
    const fingerprint = fingerprintRequest(payload);
    let executions = 0;

    const first = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => {
          executions += 1;
          return { status: 201, body: { id: "widget-1", ...payload } };
        },
      ),
    );
    expect(first.replayed).toBe(false);
    expect(first.response.status).toBe(201);

    const second = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => {
          executions += 1;
          return { status: 201, body: { id: "widget-DUPLICATE", ...payload } };
        },
      ),
    );
    expect(second.replayed).toBe(true);
    expect(second.response).toEqual(first.response);
    expect(executions).toBe(1);
  });

  it("throws IdempotencyConflictError for the same key/scope with a different request", async () => {
    const key = "req-key-002";
    const fingerprintA = fingerprintRequest({ name: "Widget B" });
    const fingerprintB = fingerprintRequest({ name: "Widget B (edited)" });

    await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprintA,
        },
        async () => ({ status: 201, body: { id: "widget-2" } }),
      ),
    );

    await expect(
      withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        executeIdempotently(
          tx,
          {
            workspaceId: workspaceAId,
            operation: OPERATION,
            idempotencyKey: key,
            requestFingerprint: fingerprintB,
          },
          async () => ({ status: 201, body: { id: "widget-should-not-be-created" } }),
        ),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("keeps the same key independent and isolated across workspaces", async () => {
    const key = "req-key-003";
    const fingerprint = fingerprintRequest({ name: "Widget C" });

    const a = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => ({ status: 201, body: { id: "widget-in-a" } }),
      ),
    );
    const b = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceBId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => ({ status: 201, body: { id: "widget-in-b" } }),
      ),
    );

    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
    expect(a.response.body).toEqual({ id: "widget-in-a" });
    expect(b.response.body).toEqual({ id: "widget-in-b" });
  });

  it("fails closed: a query with no workspace context sees no idempotent_requests rows", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT id FROM public.idempotent_requests");
      expect(rows).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("durably replays across a brand-new pool/process, not an in-memory cache", async () => {
    const key = "req-key-004";
    const fingerprint = fingerprintRequest({ name: "Widget D" });

    const firstPool = new Pool({ connectionString: harness.appUri });
    try {
      await withWorkspaceContext(firstPool, { workspaceId: workspaceAId }, (tx) =>
        executeIdempotently(
          tx,
          {
            workspaceId: workspaceAId,
            operation: OPERATION,
            idempotencyKey: key,
            requestFingerprint: fingerprint,
          },
          async () => ({ status: 201, body: { id: "widget-durable" } }),
        ),
      );
    } finally {
      await firstPool.end();
    }

    // A completely separate Pool instance -- nothing in this process can be
    // reading from the first Pool's memory; only a durably committed row can
    // produce this result.
    const secondPool = new Pool({ connectionString: harness.appUri });
    try {
      const replay = await withWorkspaceContext(secondPool, { workspaceId: workspaceAId }, (tx) =>
        executeIdempotently(
          tx,
          {
            workspaceId: workspaceAId,
            operation: OPERATION,
            idempotencyKey: key,
            requestFingerprint: fingerprint,
          },
          async () => ({ status: 201, body: { id: "widget-should-not-run" } }),
        ),
      );
      expect(replay.replayed).toBe(true);
      expect(replay.response.body).toEqual({ id: "widget-durable" });
    } finally {
      await secondPool.end();
    }
  });

  it("true concurrency: two independent connections racing the same key/fingerprint execute the callback exactly once", async () => {
    const key = "req-key-005";
    const fingerprint = fingerprintRequest({ name: "Widget E" });
    let executions = 0;

    const [clientA, clientB] = await openIndependentConnections(harness.appUri, 2);
    try {
      const run = async (client: Client, marker: string) => {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]);
        try {
          const result = await executeIdempotently(
            client,
            {
              workspaceId: workspaceAId,
              operation: OPERATION,
              idempotencyKey: key,
              requestFingerprint: fingerprint,
            },
            async () => {
              executions += 1;
              return { status: 201, body: { id: marker } };
            },
          );
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      };

      const [resultA, resultB] = await Promise.all([
        run(clientA!, "from-A"),
        run(clientB!, "from-B"),
      ]);

      expect(executions).toBe(1);
      // Exactly one of the two ran the callback; the other replayed it.
      const outcomes = [resultA.replayed, resultB.replayed].sort();
      expect(outcomes).toEqual([false, true]);
      expect(resultA.response).toEqual(resultB.response);
    } finally {
      await clientA!.end();
      await clientB!.end();
    }
  });

  it("regression: a failed/rolled-back attempt does not poison the key for a later legitimate attempt", async () => {
    const key = "req-key-006";
    const fingerprint = fingerprintRequest({ name: "Widget F" });

    // Transaction A begins idempotent execution and its business logic
    // throws before the surrounding transaction commits.
    await expect(
      withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        executeIdempotently(
          tx,
          {
            workspaceId: workspaceAId,
            operation: OPERATION,
            idempotencyKey: key,
            requestFingerprint: fingerprint,
          },
          async () => {
            throw new Error("business mutation failed");
          },
        ),
      ),
    ).rejects.toThrow("business mutation failed");

    // The claim row from the failed attempt must have rolled back together
    // with the (never-happened) business write -- proven by observing zero
    // rows for this key from a fresh, unrelated read.
    const seenAfterFailure = await withWorkspaceContext(
      pool,
      { workspaceId: workspaceAId },
      async (tx) => {
        const { rows } = await tx.query(
          `SELECT id FROM public.idempotent_requests
            WHERE workspace_id = $1 AND operation = $2 AND idempotency_key = $3`,
          [workspaceAId, OPERATION, key],
        );
        return rows;
      },
    );
    expect(seenAfterFailure).toHaveLength(0);

    // Transaction B can now execute normally for the exact same key.
    const second = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => ({ status: 201, body: { id: "widget-after-rollback" } }),
      ),
    );
    expect(second.replayed).toBe(false);
    expect(second.response.body).toEqual({ id: "widget-after-rollback" });
  });
});
