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
import { IdempotencyConflictError, IdempotencyInProgressError } from "../idempotency-errors.js";
import { claim, complete, executeIdempotently } from "../idempotent-execution.js";
import { fingerprintRequest } from "../request-fingerprint.js";

/**
 * Issue #61 (Phase 2 PR-02A) — durable API idempotency foundation, proved
 * against real PostgreSQL. Not a single line here is Catalog-specific: the
 * `operation` string below is an arbitrary example a future consumer would
 * supply.
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

  it("executeIdempotently throws IdempotencyInProgressError while another execution still owns the key", async () => {
    const key = "req-key-006b";
    const fingerprint = fingerprintRequest({ name: "Widget F2" });

    const claimClient = new Client({ connectionString: harness.appUri });
    await claimClient.connect();
    await claimClient.query("BEGIN");
    await claimClient.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]);
    const claimed = await claim(
      claimClient,
      {
        workspaceId: workspaceAId,
        operation: OPERATION,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      },
      60_000,
    );
    expect(claimed.outcome).toBe("claimed");
    await claimClient.query("COMMIT");

    try {
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
            async () => ({ status: 201, body: { id: "should-not-run" } }),
          ),
        ),
      ).rejects.toBeInstanceOf(IdempotencyInProgressError);
    } finally {
      await claimClient.end();
    }
  });

  it("a still-live claim (unexpired lease) reports in-progress, not replay, to a concurrent duplicate", async () => {
    const key = "req-key-006";
    const fingerprint = fingerprintRequest({ name: "Widget F" });

    // Simulates a consumer whose business logic cannot fit in one
    // transaction: commit the claim on its own, leaving a genuinely
    // committed 'in_progress' row (unreachable via the single-transaction
    // executeIdempotently path used elsewhere in this file).
    const claimClient = new Client({ connectionString: harness.appUri });
    await claimClient.connect();
    await claimClient.query("BEGIN");
    await claimClient.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]);
    const claimResult = await claim(
      claimClient,
      {
        workspaceId: workspaceAId,
        operation: OPERATION,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      },
      60_000, // long-lived lease -- still valid for this test
    );
    expect(claimResult.outcome).toBe("claimed");
    await claimClient.query("COMMIT");

    try {
      const secondClient = new Client({ connectionString: harness.appUri });
      await secondClient.connect();
      try {
        await secondClient.query("BEGIN");
        await secondClient.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]);
        const second = await claim(secondClient, {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        });
        expect(second.outcome).toBe("in-progress");
        await secondClient.query("ROLLBACK");
      } finally {
        await secondClient.end();
      }
    } finally {
      await claimClient.end();
    }
  });

  it("recovers an abandoned claim once its lease expires, without permanently poisoning the key", async () => {
    const key = "req-key-007";
    const fingerprint = fingerprintRequest({ name: "Widget G" });

    const claimClient = new Client({ connectionString: harness.appUri });
    await claimClient.connect();
    await claimClient.query("BEGIN");
    await claimClient.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceAId]);
    // A lease that is already expired by the time we look at it -- simulates
    // a process that claimed the key and then died before completing it.
    const abandoned = await claim(
      claimClient,
      {
        workspaceId: workspaceAId,
        operation: OPERATION,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      },
      -1,
    );
    expect(abandoned.outcome).toBe("claimed");
    await claimClient.query("COMMIT");
    await claimClient.end();

    const recoveryPool = new Pool({ connectionString: harness.appUri });
    try {
      const recovered = await withWorkspaceContext(
        recoveryPool,
        { workspaceId: workspaceAId },
        (tx) =>
          executeIdempotently(
            tx,
            {
              workspaceId: workspaceAId,
              operation: OPERATION,
              idempotencyKey: key,
              requestFingerprint: fingerprint,
            },
            async () => ({ status: 201, body: { id: "widget-recovered" } }),
          ),
      );
      expect(recovered.replayed).toBe(false);
      expect(recovered.response.body).toEqual({ id: "widget-recovered" });

      // A subsequent call now replays the recovered, completed result.
      const replay = await withWorkspaceContext(recoveryPool, { workspaceId: workspaceAId }, (tx) =>
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
      expect(replay.response.body).toEqual({ id: "widget-recovered" });
    } finally {
      await recoveryPool.end();
    }
  });

  it("complete() is a no-op once a record is already completed (defense in depth)", async () => {
    const key = "req-key-008";
    const fingerprint = fingerprintRequest({ name: "Widget H" });

    await withWorkspaceContext(pool, { workspaceId: workspaceAId }, async (tx) => {
      const result = await claim(tx, {
        workspaceId: workspaceAId,
        operation: OPERATION,
        idempotencyKey: key,
        requestFingerprint: fingerprint,
      });
      if (result.outcome !== "claimed") throw new Error("expected a fresh claim");
      await complete(tx, result.recordId, { status: 201, body: { id: "first" } });
      // A second completion attempt on the same (now-completed) record must
      // not overwrite the stored response.
      await complete(tx, result.recordId, { status: 201, body: { id: "second-should-not-apply" } });
    });

    const replay = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      executeIdempotently(
        tx,
        {
          workspaceId: workspaceAId,
          operation: OPERATION,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
        },
        async () => ({ status: 201, body: { id: "should-not-run" } }),
      ),
    );
    expect(replay.response.body).toEqual({ id: "first" });
  });
});
