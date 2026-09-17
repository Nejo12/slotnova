/**
 * Issue #68 (Phase 2 PR-05) — Booking schema + migration + RLS + generated
 * blocking range (real PostgreSQL). Proves
 * `packages/db/migrations/0009_booking.sql` against a real server: clean and
 * forward apply, the exact column set, the exact status enum, the absence of
 * every forbidden column, RLS enabled + FORCE + policy, cross-workspace
 * isolation for reads AND writes, fail-closed behaviour with no workspace
 * context, the generated half-open `blocking_range` under every buffer
 * combination, and the continued ABSENCE of `btree_gist`/any exclusion
 * constraint (PR-06 owns those).
 *
 * Real PostgreSQL is mandatory here, not a convenience: RLS, CHECK
 * constraints, enum labels and `tstzrange` generation are database behaviour,
 * and a mocked repository would prove none of them (AGENTS.md testing
 * expectations).
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
import { createBooking } from "../domain/booking.js";
import { asBookingId, asServiceReferenceId } from "../domain/ids.js";
import { BookingsRepository } from "../infrastructure/repositories/bookings.repository.js";

const SERVICE_ID = asServiceReferenceId("33333333-3333-4333-8333-333333333333");

const instant = (value: string): Temporal.Instant => Temporal.Instant.from(value);

describe("booking migration (real PostgreSQL)", () => {
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
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0009"]));
  });

  it("applies forward onto a populated prior state without data loss", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0009",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.outbox_records (event_name, payload)
           VALUES ('platform.pre_booking_marker', '{"requestId":"req-forward-booking-1"}'::jsonb)
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

  it("creates exactly the approved Booking columns and no forbidden one", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows } = await admin.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'bookings'
          ORDER BY column_name`,
      );
      expect(rows.map((row) => row.column_name)).toEqual([
        "blocking_range",
        "cancelled_reason",
        "created_at",
        "id",
        "post_buffer_minutes",
        "pre_buffer_minutes",
        "service_duration_minutes",
        "service_id",
        "starts_at",
        "status",
        "updated_at",
        "version",
        "workspace_id",
      ]);

      // Founder decisions 3-5: no resource/location/staff/client dimension,
      // and no nullable placeholder "for later".
      expect(
        rows.filter((row) =>
          ["resource_id", "location_id", "staff_id", "client_id", "customer_id"].includes(
            row.column_name,
          ),
        ),
      ).toHaveLength(0);

      // The blocking range is a STORED GENERATED tstzrange the application
      // never writes.
      const { rows: generated } = await admin.query<{ is_generated: string; data_type: string }>(
        `SELECT is_generated, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND column_name = 'blocking_range'`,
      );
      expect(generated[0]!.is_generated).toBe("ALWAYS");
      expect(generated[0]!.data_type).toBe("tstzrange");
    } finally {
      await admin.end();
    }
  });

  it("persists exactly three status values — no draft, no pending", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows } = await admin.query<{ label: string }>(
        `SELECT e.enumlabel AS label
           FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'booking_status'
          ORDER BY e.enumsortorder`,
      );
      expect(rows.map((row) => row.label)).toEqual(["confirmed", "completed", "cancelled"]);
    } finally {
      await admin.end();
    }
  });

  it("carries the approved CHECK constraints and the documented index", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows: checks } = await admin.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'public.bookings'::regclass AND contype = 'c'
          ORDER BY conname`,
      );
      expect(checks.map((row) => row.conname)).toEqual([
        "bookings_blocking_range_non_empty",
        "bookings_cancelled_reason_requires_cancelled",
        "bookings_post_buffer_non_negative",
        "bookings_pre_buffer_non_negative",
        "bookings_service_duration_positive",
        "bookings_version_positive",
      ]);

      const { rows: indexes } = await admin.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'bookings'
          ORDER BY indexname`,
      );
      expect(indexes.map((row) => row.indexname)).toEqual([
        "bookings_pkey",
        "bookings_workspace_id_idx",
      ]);

      // `service_id` is an OPAQUE Catalog reference: the only foreign key on
      // this table is the tenant one.
      const { rows: fks } = await admin.query<{ conname: string; referenced: string }>(
        `SELECT conname, confrelid::regclass::text AS referenced FROM pg_constraint
          WHERE conrelid = 'public.bookings'::regclass AND contype = 'f'
          ORDER BY conname`,
      );
      expect(fks.map((row) => row.referenced)).toEqual(["workspaces"]);
    } finally {
      await admin.end();
    }
  });

  it("does NOT install btree_gist or any exclusion constraint — that is PR-06", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows: extensions } = await admin.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`,
      );
      expect(extensions).toHaveLength(0);

      const { rows: exclusions } = await admin.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE contype = 'x'`,
      );
      expect(exclusions).toHaveLength(0);
    } finally {
      await admin.end();
    }
  });

  it("has RLS enabled + forced + the canonical workspace policy", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(
        assertRlsCoverage(admin, [{ schema: "public", table: "bookings" }]),
      ).resolves.toHaveLength(1);

      const { rows: policies } = await admin.query<{ policyname: string }>(
        `SELECT policyname FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'bookings'`,
      );
      expect(policies.map((row) => row.policyname)).toEqual(["bookings_workspace_isolation"]);

      const { rows: flags } = await admin.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE oid = 'public.bookings'::regclass`,
      );
      expect(flags[0]!.relrowsecurity).toBe(true);
      expect(flags[0]!.relforcerowsecurity).toBe(true);
    } finally {
      await admin.end();
    }
  });

  it("grants the app role SELECT/INSERT/UPDATE but never DELETE", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      const { rows } = await admin.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = 'bookings' AND grantee = 'slotnova_app'
          ORDER BY privilege_type`,
      );
      expect(rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT", "UPDATE"]);
    } finally {
      await admin.end();
    }
  });
});

describe("booking blocking range, isolation & version guard (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let repository: BookingsRepository;
  let workspaceAId: string;
  let workspaceBId: string;

  async function seedWorkspace(label: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Booking ${label} ${suffix}`, `booking-${label}-${suffix}`],
    );
    return rows[0]!.id;
  }

  async function insert(
    workspaceId: string,
    options: {
      startsAt: string;
      durationMinutes?: number;
      preBufferMinutes?: number;
      postBufferMinutes?: number;
      serviceId?: string;
    },
  ) {
    const booking = createBooking({
      id: asBookingId(crypto.randomUUID()),
      serviceId: asServiceReferenceId(options.serviceId ?? SERVICE_ID),
      startsAt: instant(options.startsAt),
      serviceDurationMinutes: options.durationMinutes ?? 60,
      preBufferMinutes: options.preBufferMinutes ?? 0,
      postBufferMinutes: options.postBufferMinutes ?? 0,
    });
    return withWorkspaceContext(pool, { workspaceId }, (tx) =>
      repository.create(tx, asWorkspaceId(workspaceId), booking),
    );
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    workspaceAId = await seedWorkspace("a");
    workspaceBId = await seedWorkspace("b");

    pool = new Pool({ connectionString: harness.appUri });
    repository = new BookingsRepository();
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  describe("generated blocking_range", () => {
    const cases: [string, number, number, number, string, string, string][] = [
      [
        "zero buffers",
        60,
        0,
        0,
        "2026-09-07T09:00:00Z",
        "2026-09-07T09:00:00Z",
        "2026-09-07T10:00:00Z",
      ],
      [
        "pre-buffer only",
        60,
        15,
        0,
        "2026-09-07T09:00:00Z",
        "2026-09-07T08:45:00Z",
        "2026-09-07T10:00:00Z",
      ],
      [
        "post-buffer only",
        60,
        0,
        10,
        "2026-09-07T09:00:00Z",
        "2026-09-07T09:00:00Z",
        "2026-09-07T10:10:00Z",
      ],
      [
        "both buffers",
        60,
        15,
        10,
        "2026-09-07T09:00:00Z",
        "2026-09-07T08:45:00Z",
        "2026-09-07T10:10:00Z",
      ],
      [
        "crossing the midnight instant boundary",
        90,
        30,
        30,
        "2026-09-07T23:30:00Z",
        "2026-09-07T23:00:00Z",
        "2026-09-08T01:30:00Z",
      ],
    ];

    it.each(cases)(
      "computes %s from the snapshot",
      async (_label, duration, pre, post, startsAt, lower, upper) => {
        const workspaceId = await seedWorkspace("range");
        const created = await insert(workspaceId, {
          startsAt,
          durationMinutes: duration,
          preBufferMinutes: pre,
          postBufferMinutes: post,
        });

        expect(created.blockingRangeStart).toBeInstanceOf(Temporal.Instant);
        expect(created.blockingRangeStart.toString()).toBe(lower);
        expect(created.blockingRangeEnd.toString()).toBe(upper);
      },
    );

    it("stores a half-open [lower, upper) range, whatever the session time zone", async () => {
      const workspaceId = await seedWorkspace("halfopen");
      const created = await insert(workspaceId, {
        startsAt: "2026-03-08T06:30:00Z", // inside America/New_York's spring-forward day
        durationMinutes: 60,
        preBufferMinutes: 15,
        postBufferMinutes: 10,
      });

      // The stored range is an absolute span: only its RENDERING changes with
      // the session zone, never the instants, which is exactly why
      // `booking_blocking_range()` may honestly be declared IMMUTABLE.
      for (const zone of ["UTC", "America/New_York", "Pacific/Kiritimati"]) {
        await admin.query(`SET TIME ZONE '${zone}'`);
        const { rows } = await admin.query<{ bounds: string; lower_epoch: string }>(
          `SELECT blocking_range::text AS bounds,
                  extract(epoch from lower(blocking_range))::text AS lower_epoch
             FROM public.bookings WHERE id = $1`,
          [created.id],
        );
        expect(rows[0]!.bounds.startsWith("[")).toBe(true);
        expect(rows[0]!.bounds.endsWith(")")).toBe(true);
        // 2026-03-08T06:15:00Z — the same absolute instant in every session.
        expect(Number(rows[0]!.lower_epoch)).toBe(
          instant("2026-03-08T06:15:00Z").epochMilliseconds / 1000,
        );
      }
      await admin.query("SET TIME ZONE 'UTC'");
    });

    it("rejects an empty/inverted range and out-of-range snapshot values", async () => {
      const workspaceId = await seedWorkspace("badrange");
      for (const [duration, pre, post] of [
        [0, 0, 0],
        [-30, 0, 0],
        [60, -1, 0],
        [60, 0, -1],
      ] as const) {
        await expect(
          withWorkspaceContext(pool, { workspaceId }, (tx) =>
            tx.query(
              `INSERT INTO public.bookings
                 (workspace_id, service_id, starts_at, service_duration_minutes,
                  pre_buffer_minutes, post_buffer_minutes, status)
               VALUES ($1, $2, '2026-09-07T09:00:00Z', $3, $4, $5, 'confirmed')`,
              [workspaceId, SERVICE_ID, duration, pre, post],
            ),
          ),
          // Either a CHECK constraint or, when the generated expression
          // itself would produce an inverted range, `tstzrange()`'s own
          // "lower bound must be less than or equal to upper bound" — both
          // are the database refusing the row, which is the point.
        ).rejects.toThrow(/violates check constraint|range lower bound/iu);
      }
    });

    it("refuses a cancellation reason on a non-cancelled booking", async () => {
      const workspaceId = await seedWorkspace("reason");
      const created = await insert(workspaceId, { startsAt: "2026-09-07T09:00:00Z" });
      await expect(
        withWorkspaceContext(pool, { workspaceId }, (tx) =>
          tx.query(`UPDATE public.bookings SET cancelled_reason = 'nope' WHERE id = $1`, [
            created.id,
          ]),
        ),
      ).rejects.toThrow(/bookings_cancelled_reason_requires_cancelled/u);
    });

    it("refuses a status value outside the three-label enum", async () => {
      const workspaceId = await seedWorkspace("badstatus");
      for (const status of ["draft", "pending"]) {
        await expect(
          withWorkspaceContext(pool, { workspaceId }, (tx) =>
            tx.query(
              `INSERT INTO public.bookings
                 (workspace_id, service_id, starts_at, service_duration_minutes,
                  pre_buffer_minutes, post_buffer_minutes, status)
               VALUES ($1, $2, '2026-09-07T09:00:00Z', 60, 0, 0, $3::booking_status)`,
              [workspaceId, SERVICE_ID, status],
            ),
          ),
        ).rejects.toThrow(/invalid input value for enum booking_status/u);
      }
    });
  });

  describe("snapshot immutability", () => {
    it("keeps the persisted duration/buffers independent of a later Service edit", async () => {
      const workspaceId = await seedWorkspace("snapshot");

      // A real Catalog row, written with raw SQL: Booking must never acquire
      // a Catalog repository (constitution III), and this test must not
      // become the first cross-module import.
      const { rows: serviceRows } = await admin.query<{ id: string }>(
        `INSERT INTO public.services
           (workspace_id, name, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
            price_amount_minor, price_currency)
         VALUES ($1, 'Snapshot cut', 60, 15, 10, 5000, 'EUR')
         RETURNING id`,
        [workspaceId],
      );
      const serviceId = serviceRows[0]!.id;

      const created = await insert(workspaceId, {
        startsAt: "2026-09-07T09:00:00Z",
        durationMinutes: 60,
        preBufferMinutes: 15,
        postBufferMinutes: 10,
        serviceId,
      });

      // The Service changes drastically AFTER the booking exists.
      await admin.query(
        `UPDATE public.services
            SET duration_minutes = 240, pre_buffer_minutes = 0, post_buffer_minutes = 90
          WHERE id = $1`,
        [serviceId],
      );

      const reread = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.findById(tx, created.id),
      );
      expect(reread!.serviceDurationMinutes).toBe(60);
      expect(reread!.preBufferMinutes).toBe(15);
      expect(reread!.postBufferMinutes).toBe(10);
      expect(reread!.blockingRangeStart.toString()).toBe("2026-09-07T08:45:00Z");
      expect(reread!.blockingRangeEnd.toString()).toBe("2026-09-07T10:10:00Z");
    });

    it("does not re-snapshot on reschedule: only the range moves", async () => {
      const workspaceId = await seedWorkspace("resnapshot");
      const created = await insert(workspaceId, {
        startsAt: "2026-09-07T09:00:00Z",
        durationMinutes: 60,
        preBufferMinutes: 15,
        postBufferMinutes: 10,
      });

      const moved = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.reschedule(tx, created.id, {
          startsAt: instant("2026-09-07T11:00:00Z"),
          expectedVersion: 1,
          nextVersion: 2,
        }),
      );

      expect(moved!.serviceDurationMinutes).toBe(60);
      expect(moved!.preBufferMinutes).toBe(15);
      expect(moved!.postBufferMinutes).toBe(10);
      expect(moved!.serviceId).toBe(created.serviceId);
      expect(moved!.blockingRangeStart.toString()).toBe("2026-09-07T10:45:00Z");
      expect(moved!.blockingRangeEnd.toString()).toBe("2026-09-07T12:10:00Z");
    });
  });

  describe("optimistic version guard", () => {
    it("starts at 1 and increments on every real mutation", async () => {
      const workspaceId = await seedWorkspace("version");
      const created = await insert(workspaceId, { startsAt: "2026-09-07T09:00:00Z" });
      expect(created.version).toBe(1);

      const rescheduled = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.reschedule(tx, created.id, {
          startsAt: instant("2026-09-07T10:00:00Z"),
          expectedVersion: 1,
          nextVersion: 2,
        }),
      );
      expect(rescheduled!.version).toBe(2);

      const cancelled = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.cancel(tx, created.id, {
          cancelledReason: "client cancelled",
          expectedVersion: 2,
          nextVersion: 3,
        }),
      );
      expect(cancelled!.version).toBe(3);
      expect(cancelled!.status).toBe("cancelled");
      expect(cancelled!.cancelledReason).toBe("client cancelled");
    });

    it("completes a confirmed booking and keeps its blocking history", async () => {
      const workspaceId = await seedWorkspace("complete");
      const created = await insert(workspaceId, {
        startsAt: "2026-09-07T09:00:00Z",
        preBufferMinutes: 15,
        postBufferMinutes: 10,
      });

      const completed = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.complete(tx, created.id, { expectedVersion: 1, nextVersion: 2 }),
      );
      expect(completed!.status).toBe("completed");
      expect(completed!.version).toBe(2);
      expect(completed!.blockingRangeStart.toString()).toBe(created.blockingRangeStart.toString());
      expect(completed!.blockingRangeEnd.toString()).toBe(created.blockingRangeEnd.toString());
    });

    it("a stale expectedVersion matches no row and overwrites nothing", async () => {
      const workspaceId = await seedWorkspace("stale");
      const created = await insert(workspaceId, { startsAt: "2026-09-07T09:00:00Z" });

      await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.reschedule(tx, created.id, {
          startsAt: instant("2026-09-07T10:00:00Z"),
          expectedVersion: 1,
          nextVersion: 2,
        }),
      );

      // Every mutating method, replayed with the now-stale version 1.
      const stale = await withWorkspaceContext(pool, { workspaceId }, async (tx) => [
        await repository.reschedule(tx, created.id, {
          startsAt: instant("2026-09-09T09:00:00Z"),
          expectedVersion: 1,
          nextVersion: 2,
        }),
        await repository.cancel(tx, created.id, {
          cancelledReason: "stale",
          expectedVersion: 1,
          nextVersion: 2,
        }),
        await repository.complete(tx, created.id, { expectedVersion: 1, nextVersion: 2 }),
      ]);
      expect(stale).toEqual([null, null, null]);

      const current = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.findById(tx, created.id),
      );
      expect(current!.version).toBe(2);
      expect(current!.status).toBe("confirmed");
      expect(current!.startsAt.toString()).toBe("2026-09-07T10:00:00Z");
      expect(current!.cancelledReason).toBeNull();
    });

    it("a terminal booking cannot be mutated again even with a matching version", async () => {
      const workspaceId = await seedWorkspace("terminal");
      const created = await insert(workspaceId, { startsAt: "2026-09-07T09:00:00Z" });
      await withWorkspaceContext(pool, { workspaceId }, (tx) =>
        repository.cancel(tx, created.id, {
          cancelledReason: null,
          expectedVersion: 1,
          nextVersion: 2,
        }),
      );

      const attempts = await withWorkspaceContext(pool, { workspaceId }, async (tx) => [
        await repository.reschedule(tx, created.id, {
          startsAt: instant("2026-09-09T09:00:00Z"),
          expectedVersion: 2,
          nextVersion: 3,
        }),
        await repository.complete(tx, created.id, { expectedVersion: 2, nextVersion: 3 }),
      ]);
      expect(attempts).toEqual([null, null]);
    });
  });

  describe("tenant isolation", () => {
    it("keeps workspace A's booking invisible to workspace B", async () => {
      const created = await insert(workspaceAId, { startsAt: "2026-10-01T09:00:00Z" });

      const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        repository.findById(tx, created.id),
      );
      expect(fromB).toBeNull();
    });

    it("refuses a cross-workspace insert (RLS WITH CHECK)", async () => {
      const booking = createBooking({
        id: asBookingId(crypto.randomUUID()),
        serviceId: SERVICE_ID,
        startsAt: instant("2026-10-02T09:00:00Z"),
        serviceDurationMinutes: 60,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
      });

      await expect(
        withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
          // Row claims workspace B while the transaction's context is A.
          repository.create(tx, asWorkspaceId(workspaceBId), booking),
        ),
      ).rejects.toThrow(/row-level security/iu);
    });

    it("refuses a cross-workspace mutation: B cannot cancel or reschedule A's booking", async () => {
      const created = await insert(workspaceAId, { startsAt: "2026-10-03T09:00:00Z" });

      const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, async (tx) => [
        await repository.cancel(tx, created.id, {
          cancelledReason: "hijacked",
          expectedVersion: 1,
          nextVersion: 2,
        }),
        await repository.reschedule(tx, created.id, {
          startsAt: instant("2026-10-04T09:00:00Z"),
          expectedVersion: 1,
          nextVersion: 2,
        }),
        await repository.complete(tx, created.id, { expectedVersion: 1, nextVersion: 2 }),
      ]);
      expect(fromB).toEqual([null, null, null]);

      const { rows } = await admin.query<{
        status: string;
        version: number;
        cancelled_reason: string | null;
      }>(`SELECT status, version, cancelled_reason FROM public.bookings WHERE id = $1`, [
        created.id,
      ]);
      expect(rows[0]).toMatchObject({ status: "confirmed", version: 1, cancelled_reason: null });
    });

    it("fails closed: no workspace context sees no booking rows and can write none", async () => {
      await insert(workspaceAId, { startsAt: "2026-10-05T09:00:00Z" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query("SELECT id FROM public.bookings");
        expect(rows).toHaveLength(0);
        await expect(
          client.query(
            `INSERT INTO public.bookings
               (workspace_id, service_id, starts_at, service_duration_minutes,
                pre_buffer_minutes, post_buffer_minutes, status)
             VALUES ($1, $2, '2026-10-06T09:00:00Z', 60, 0, 0, 'confirmed')`,
            [workspaceAId, SERVICE_ID],
          ),
        ).rejects.toThrow(/row-level security/iu);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });
});
