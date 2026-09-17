/**
 * Issue #66 (Phase 2 PR-04) — Scheduling schema + migration + RLS +
 * repository tests (real PostgreSQL). Proves
 * `packages/db/migrations/0008_scheduling.sql` against a real server: clean
 * and forward apply, table/constraint/index presence, RLS enabled + FORCE +
 * policy on both tables, cross-workspace isolation for reads and writes,
 * fail-closed behaviour with no workspace context, and the two repositories'
 * bounded query behaviour.
 *
 * Real PostgreSQL is mandatory here, not a convenience: RLS, the CHECK
 * constraints and `daterange`/`timestamptz` overlap semantics are database
 * behaviour, and a mocked repository would prove none of them (AGENTS.md
 * testing expectations).
 */
import { Temporal } from "@js-temporal/polyfill";
import { Client, DEFAULT_MIGRATIONS_DIR, Pool, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertCleanMigration,
  assertForwardMigration,
  assertRlsCoverage,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asWorkspaceId } from "../../identity/index.js";
import { withWorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import { createInterval } from "../domain/interval.js";
import { AvailabilityExceptionsRepository } from "../infrastructure/repositories/availability-exceptions.repository.js";
import { AvailabilityPatternsRepository } from "../infrastructure/repositories/availability-patterns.repository.js";

const MON_9_TO_5 = [{ dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 }] as const;

const date = (value: string): Temporal.PlainDate => Temporal.PlainDate.from(value);
const instant = (value: string): Temporal.Instant => Temporal.Instant.from(value);

describe("scheduling migration (real PostgreSQL)", () => {
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
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0008"]));
  });

  it("applies forward onto a populated prior state without data loss", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0008",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.outbox_records (event_name, payload)
           VALUES ('platform.pre_scheduling_marker', '{"requestId":"req-forward-scheduling-1"}'::jsonb)
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

  it("has RLS enabled + forced + a policy on both Scheduling tables", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(
        assertRlsCoverage(admin, [
          { schema: "public", table: "availability_patterns" },
          { schema: "public", table: "availability_exceptions" },
        ]),
      ).resolves.toHaveLength(2);

      const { rows: policies } = await admin.query<{ tablename: string; policyname: string }>(
        `SELECT tablename, policyname FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename IN ('availability_patterns', 'availability_exceptions')
          ORDER BY tablename`,
      );
      expect(policies.map((row) => `${row.tablename}:${row.policyname}`)).toEqual([
        "availability_exceptions:availability_exceptions_workspace_isolation",
        "availability_patterns:availability_patterns_workspace_isolation",
      ]);
    } finally {
      await admin.end();
    }
  });

  it("creates the documented indexes and no speculative resource/location/staff column", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows: indexes } = await admin.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN ('availability_patterns', 'availability_exceptions')
          ORDER BY indexname`,
      );
      expect(indexes.map((row) => row.indexname)).toEqual([
        "availability_exceptions_pkey",
        "availability_exceptions_workspace_id_starts_at_idx",
        "availability_patterns_pkey",
        "availability_patterns_workspace_id_idx",
      ]);

      const { rows: columns } = await admin.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name IN ('availability_patterns', 'availability_exceptions')
            AND column_name IN ('resource_id', 'location_id', 'staff_id')`,
      );
      expect(columns).toHaveLength(0);

      // btree_gist belongs to PR-06 (Booking overlap), not to this slice.
      const { rows: extensions } = await admin.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`,
      );
      expect(extensions).toHaveLength(0);
    } finally {
      await admin.end();
    }
  });
});

describe("scheduling tenant isolation & repository behavior (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let patterns: AvailabilityPatternsRepository;
  let exceptions: AvailabilityExceptionsRepository;
  let workspaceAId: string;
  let workspaceBId: string;

  /** A fresh workspace per test, so pattern-history assertions never interfere. */
  async function seedWorkspace(label: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Scheduling ${label} ${suffix}`, `sched-${label}-${suffix}`],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    workspaceAId = await seedWorkspace("a");
    workspaceBId = await seedWorkspace("b");

    pool = new Pool({ connectionString: harness.appUri });
    patterns = new AvailabilityPatternsRepository();
    exceptions = new AvailabilityExceptionsRepository();
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  describe("availability_patterns", () => {
    it("round-trips a pattern with Temporal values and no JavaScript Date", async () => {
      const workspaceId = await seedWorkspace("roundtrip");
      const created = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        patterns.create(tx, {
          workspaceId: asWorkspaceId(workspaceId),
          timezone: "Europe/London",
          weeklyRule: MON_9_TO_5,
          effectiveFrom: date("2026-09-01"),
          effectiveUntil: date("2026-10-01"),
        }),
      );

      expect(created.timezone).toBe("Europe/London");
      expect(created.weeklyRule).toEqual([...MON_9_TO_5]);
      expect(created.effectiveFrom).toBeInstanceOf(Temporal.PlainDate);
      expect(created.effectiveFrom?.toString()).toBe("2026-09-01");
      expect(created.effectiveUntil?.toString()).toBe("2026-10-01");

      const listed = await withWorkspaceContext(pool, { workspaceId }, (tx) => patterns.list(tx));
      expect(listed).toHaveLength(1);
      expect(listed[0]!.id).toBe(created.id);
    });

    it("accepts unbounded effective bounds as NULL", async () => {
      const workspaceId = await seedWorkspace("unbounded");
      const created = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        patterns.create(tx, {
          workspaceId: asWorkspaceId(workspaceId),
          timezone: "Europe/London",
          weeklyRule: MON_9_TO_5,
          effectiveFrom: null,
          effectiveUntil: null,
        }),
      );
      expect(created.effectiveFrom).toBeNull();
      expect(created.effectiveUntil).toBeNull();
    });

    it("rejects an inverted effective window at the database level", async () => {
      const workspaceId = await seedWorkspace("inverted");
      await expect(
        withWorkspaceContext(pool, { workspaceId }, (tx) =>
          patterns.create(tx, {
            workspaceId: asWorkspaceId(workspaceId),
            timezone: "Europe/London",
            weeklyRule: MON_9_TO_5,
            effectiveFrom: date("2026-10-01"),
            effectiveUntil: date("2026-09-01"),
          }),
        ),
      ).rejects.toThrow();
    });

    it("lists effective-dated history oldest window first, deterministically", async () => {
      const workspaceId = await seedWorkspace("history");
      for (const [from, until] of [
        ["2026-10-01", "2026-11-01"],
        [null, "2026-09-01"],
        ["2026-09-01", "2026-10-01"],
      ] as const) {
        await withWorkspaceContext(pool, { workspaceId }, (tx) =>
          patterns.create(tx, {
            workspaceId: asWorkspaceId(workspaceId),
            timezone: "Europe/London",
            weeklyRule: MON_9_TO_5,
            effectiveFrom: from === null ? null : date(from),
            effectiveUntil: date(until),
          }),
        );
      }

      const listed = await withWorkspaceContext(pool, { workspaceId }, (tx) => patterns.list(tx));
      expect(listed.map((row) => row.effectiveFrom?.toString() ?? null)).toEqual([
        null,
        "2026-09-01",
        "2026-10-01",
      ]);
    });

    it("selects only the patterns whose effective window overlaps the requested range", async () => {
      const workspaceId = await seedWorkspace("overlapquery");
      for (const [from, until] of [
        ["2026-09-01", "2026-10-01"],
        ["2026-10-01", "2026-11-01"],
        ["2026-11-01", "2026-12-01"],
      ] as const) {
        await withWorkspaceContext(pool, { workspaceId }, (tx) =>
          patterns.create(tx, {
            workspaceId: asWorkspaceId(workspaceId),
            timezone: "Europe/London",
            weeklyRule: MON_9_TO_5,
            effectiveFrom: date(from),
            effectiveUntil: date(until),
          }),
        );
      }

      const overlapping = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        patterns.listOverlappingEffectiveWindow(tx, {
          from: date("2026-09-15"),
          until: date("2026-10-15"),
        }),
      );
      expect(overlapping.map((row) => row.effectiveFrom!.toString())).toEqual([
        "2026-09-01",
        "2026-10-01",
      ]);

      // Half-open on both sides: a window ending exactly where the request
      // starts contributes nothing.
      const touching = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        patterns.listOverlappingEffectiveWindow(tx, {
          from: date("2026-10-01"),
          until: date("2026-10-02"),
        }),
      );
      expect(touching.map((row) => row.effectiveFrom!.toString())).toEqual(["2026-10-01"]);
    });

    it("detects an overlapping effective window, treating NULL bounds as unbounded", async () => {
      const workspaceId = await seedWorkspace("existsoverlap");
      await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        patterns.create(tx, {
          workspaceId: asWorkspaceId(workspaceId),
          timezone: "Europe/London",
          weeklyRule: MON_9_TO_5,
          effectiveFrom: date("2026-09-01"),
          effectiveUntil: date("2026-10-01"),
        }),
      );

      const cases: [string, { from: string | null; until: string | null }, boolean][] = [
        ["identical window", { from: "2026-09-01", until: "2026-10-01" }, true],
        ["window inside it", { from: "2026-09-10", until: "2026-09-12" }, true],
        ["window straddling its start", { from: "2026-08-01", until: "2026-09-02" }, true],
        [
          "adjacent before (exclusive upper bound)",
          { from: "2026-08-01", until: "2026-09-01" },
          false,
        ],
        [
          "adjacent after (inclusive lower bound)",
          { from: "2026-10-01", until: "2026-11-01" },
          false,
        ],
        ["fully unbounded", { from: null, until: null }, true],
        ["unbounded below, ending at its start", { from: null, until: "2026-09-01" }, false],
        ["unbounded above, starting at its end", { from: "2026-10-01", until: null }, false],
      ];

      for (const [label, window, expected] of cases) {
        const found = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
          patterns.existsOverlappingEffectiveWindow(tx, {
            from: window.from === null ? null : date(window.from),
            until: window.until === null ? null : date(window.until),
          }),
        );
        expect(found, label).toBe(expected);
      }
    });

    it("keeps workspace A's patterns invisible to workspace B", async () => {
      await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        patterns.create(tx, {
          workspaceId: asWorkspaceId(workspaceAId),
          timezone: "Europe/London",
          weeklyRule: MON_9_TO_5,
          effectiveFrom: null,
          effectiveUntil: null,
        }),
      );

      const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        patterns.list(tx),
      );
      expect(fromB).toHaveLength(0);

      const overlapFromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        patterns.existsOverlappingEffectiveWindow(tx, { from: null, until: null }),
      );
      expect(overlapFromB).toBe(false);
    });

    it("rejects a cross-workspace pattern insert (RLS WITH CHECK)", async () => {
      await expect(
        withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
          patterns.create(tx, {
            // Row claims workspace B while the transaction's context is A.
            workspaceId: asWorkspaceId(workspaceBId),
            timezone: "Europe/London",
            weeklyRule: MON_9_TO_5,
            effectiveFrom: null,
            effectiveUntil: null,
          }),
        ),
      ).rejects.toThrow();
    });

    it("cannot be mutated cross-workspace: the app role holds no UPDATE/DELETE grant at all", async () => {
      const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        patterns.create(tx, {
          workspaceId: asWorkspaceId(workspaceAId),
          timezone: "Europe/London",
          weeklyRule: MON_9_TO_5,
          effectiveFrom: date("2027-01-04"),
          effectiveUntil: date("2027-02-01"),
        }),
      );

      // The approved contract exposes no update or delete endpoint, so
      // 0008_scheduling.sql grants the app role SELECT + INSERT only. Raw SQL
      // (not a repository method -- none exists) proves the privilege itself
      // is absent, which is a stronger guarantee than the RLS policy alone:
      // the statement is refused before any row is even considered. RLS
      // remains the tenant boundary for the SELECT/INSERT paths that DO
      // exist, asserted by the neighbouring visibility/WITH CHECK tests.
      for (const workspaceId of [workspaceBId, workspaceAId]) {
        await expect(
          withWorkspaceContext(pool, { workspaceId }, (tx) =>
            tx.query(
              `UPDATE public.availability_patterns SET timezone = 'Pacific/Auckland' WHERE id = $1`,
              [created.id],
            ),
          ),
        ).rejects.toThrow(/permission denied/iu);
      }

      const { rows } = await admin.query<{ timezone: string }>(
        `SELECT timezone FROM public.availability_patterns WHERE id = $1`,
        [created.id],
      );
      expect(rows[0]!.timezone).toBe("Europe/London");
    });

    it("fails closed: no workspace context sees no pattern rows", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT id FROM public.availability_patterns");
        expect(rows).toHaveLength(0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  describe("availability_exceptions", () => {
    it("round-trips a half-open instant range", async () => {
      const workspaceId = await seedWorkspace("exception");
      const created = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        exceptions.create(tx, {
          workspaceId: asWorkspaceId(workspaceId),
          interval: createInterval(
            instant("2026-09-07T10:00:00Z"),
            instant("2026-09-07T12:00:00Z"),
          ),
          reason: "Dentist",
        }),
      );

      expect(created.startsAt).toBeInstanceOf(Temporal.Instant);
      expect(created.startsAt.toString()).toBe("2026-09-07T10:00:00Z");
      expect(created.endsAt.toString()).toBe("2026-09-07T12:00:00Z");
      expect(created.reason).toBe("Dentist");
    });

    it("rejects an inverted range at the database level", async () => {
      const workspaceId = await seedWorkspace("exc-inverted");
      await withWorkspaceContext(pool, { workspaceId }, async (tx) => {
        await expect(
          tx.query(
            `INSERT INTO public.availability_exceptions (workspace_id, starts_at, ends_at)
             VALUES ($1, '2026-09-07T12:00:00Z', '2026-09-07T10:00:00Z')`,
            [workspaceId],
          ),
        ).rejects.toThrow();
      });
    });

    it("returns only exceptions that genuinely overlap the requested range", async () => {
      const workspaceId = await seedWorkspace("exc-range");
      for (const [start, end] of [
        ["2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"],
        ["2026-09-05T09:00:00Z", "2026-09-05T11:00:00Z"],
        ["2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z"],
      ] as const) {
        await withWorkspaceContext(pool, { workspaceId }, (tx) =>
          exceptions.create(tx, {
            workspaceId: asWorkspaceId(workspaceId),
            interval: createInterval(instant(start), instant(end)),
            reason: null,
          }),
        );
      }

      const found = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        exceptions.listOverlapping(
          tx,
          createInterval(instant("2026-09-04T00:00:00Z"), instant("2026-09-08T00:00:00Z")),
        ),
      );
      expect(found.map((row) => row.startsAt.toString())).toEqual(["2026-09-05T09:00:00Z"]);

      // Half-open: an exception ending exactly at the range start does not
      // overlap it (SC-002 adjacency rule).
      const touching = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        exceptions.listOverlapping(
          tx,
          createInterval(instant("2026-09-02T00:00:00Z"), instant("2026-09-03T00:00:00Z")),
        ),
      );
      expect(touching).toHaveLength(0);
    });

    it("keeps workspace A's exceptions invisible to workspace B and rejects cross-workspace writes", async () => {
      await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        exceptions.create(tx, {
          workspaceId: asWorkspaceId(workspaceAId),
          interval: createInterval(
            instant("2026-12-24T00:00:00Z"),
            instant("2026-12-26T00:00:00Z"),
          ),
          reason: "A only",
        }),
      );

      const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        exceptions.listOverlapping(
          tx,
          createInterval(instant("2026-12-01T00:00:00Z"), instant("2027-01-01T00:00:00Z")),
        ),
      );
      expect(fromB).toHaveLength(0);

      await expect(
        withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
          exceptions.create(tx, {
            workspaceId: asWorkspaceId(workspaceBId),
            interval: createInterval(
              instant("2026-12-24T00:00:00Z"),
              instant("2026-12-26T00:00:00Z"),
            ),
            reason: "should never be written",
          }),
        ),
      ).rejects.toThrow();
    });

    it("cannot be mutated cross-workspace: the app role holds no UPDATE/DELETE grant at all", async () => {
      const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        exceptions.create(tx, {
          workspaceId: asWorkspaceId(workspaceAId),
          interval: createInterval(
            instant("2027-03-01T00:00:00Z"),
            instant("2027-03-02T00:00:00Z"),
          ),
          reason: "A only",
        }),
      );

      for (const workspaceId of [workspaceBId, workspaceAId]) {
        await expect(
          withWorkspaceContext(pool, { workspaceId }, (tx) =>
            tx.query(
              `UPDATE public.availability_exceptions SET reason = 'hijacked' WHERE id = $1`,
              [created.id],
            ),
          ),
        ).rejects.toThrow(/permission denied/iu);
        await expect(
          withWorkspaceContext(pool, { workspaceId }, (tx) =>
            tx.query(`DELETE FROM public.availability_exceptions WHERE id = $1`, [created.id]),
          ),
        ).rejects.toThrow(/permission denied/iu);
      }

      const { rows } = await admin.query<{ reason: string }>(
        `SELECT reason FROM public.availability_exceptions WHERE id = $1`,
        [created.id],
      );
      expect(rows[0]!.reason).toBe("A only");
    });

    it("fails closed: no workspace context sees no exception rows", async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT id FROM public.availability_exceptions");
        expect(rows).toHaveLength(0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });
});
