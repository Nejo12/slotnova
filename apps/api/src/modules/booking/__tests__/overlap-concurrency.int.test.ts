/**
 * Issue #70 (Phase 2 PR-06) — Booking overlap / concurrency against real
 * PostgreSQL.
 *
 * This file is the proof that **PostgreSQL**, not application code, is the
 * booking-overlap correctness boundary (ADR-011, SC-001, SC-003, FR-046).
 * Nothing here calls an application-level availability check, because none
 * exists and none may exist: "no check-then-insert as the sole booking-overlap
 * protection" is an AGENTS.md hard prohibition and this slice is exactly where
 * it is load-bearing.
 *
 * ## What "concurrent" means here
 *
 * Every race in this file uses `openIndependentConnections`: separate physical
 * `pg.Client` sessions, never two calls on one pooled client and never
 * `Promise.all` over a single connection. Each racing transaction is driven to
 * an explicit barrier — `BEGIN` + tenant context (+ for the optimistic-version
 * race, its `SELECT` of the current version) — *before* either statement that
 * can conflict is issued, and neither commits until both statements are
 * in flight. The loser then genuinely blocks on the winner's uncommitted index
 * entry / row lock and resolves only when the winner commits. Sequential calls
 * dressed up as concurrency are explicitly insufficient (tasks.md PR-06).
 */
import { Temporal } from "@js-temporal/polyfill";
import { Client, DEFAULT_MIGRATIONS_DIR, Pool, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertCleanMigration,
  assertForwardMigration,
  openIndependentConnections,
  startPostgres,
  withIsolatedDatabase,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import { CancelBookingUseCase } from "../application/cancel-booking.use-case.js";
import { CompleteBookingUseCase } from "../application/complete-booking.use-case.js";
import { CreateBookingUseCase } from "../application/create-booking.use-case.js";
import { RescheduleBookingUseCase } from "../application/reschedule-booking.use-case.js";
import { BookingOverlapError, StaleBookingVersionError } from "../domain/booking-errors.js";
import { asServiceReferenceId } from "../domain/ids.js";
import { BookingsRepository } from "../infrastructure/repositories/bookings.repository.js";

const SERVICE_ID = asServiceReferenceId("55555555-5555-4555-8555-555555555555");
const OVERLAP_CONSTRAINT = "bookings_no_overlap";
const EXCLUSION_VIOLATION = "23P01";
const DEADLOCK_DETECTED = "40P01";

const instant = (value: string): Temporal.Instant => Temporal.Instant.from(value);

interface PgError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

const asPgError = (error: unknown): PgError => error as PgError;

/**
 * Raw insert used by the DB-boundary proofs. Deliberately NOT the repository:
 * these tests assert what PostgreSQL does, so they must not be able to pass
 * because some TypeScript guard ran first.
 */
const INSERT = `
  INSERT INTO public.bookings
    (workspace_id, service_id, starts_at, service_duration_minutes,
     pre_buffer_minutes, post_buffer_minutes, status)
  VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7::booking_status)
  RETURNING id, to_json(lower(blocking_range)) #>> '{}' AS lower,
                to_json(upper(blocking_range)) #>> '{}' AS upper`;

/** Reschedule statement used by the DB-boundary race proofs. */
const MOVE = `UPDATE public.bookings
                 SET starts_at = $2::timestamptz, version = version + 1, updated_at = now()
               WHERE id = $1 AND status = 'confirmed'
           RETURNING id`;

interface BookingSpec {
  readonly startsAt: string;
  readonly durationMinutes?: number;
  readonly preBufferMinutes?: number;
  readonly postBufferMinutes?: number;
  readonly status?: "confirmed" | "cancelled" | "completed";
}

function insertParams(workspaceId: string, spec: BookingSpec): unknown[] {
  return [
    workspaceId,
    SERVICE_ID,
    spec.startsAt,
    spec.durationMinutes ?? 60,
    spec.preBufferMinutes ?? 0,
    spec.postBufferMinutes ?? 0,
    spec.status ?? "confirmed",
  ];
}

describe("booking overlap exclusion constraint (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let create: CreateBookingUseCase;
  let reschedule: RescheduleBookingUseCase;
  let cancel: CancelBookingUseCase;
  let complete: CompleteBookingUseCase;

  async function seedWorkspace(label: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Booking overlap ${label} ${suffix}`, `booking-overlap-${label}-${suffix}`],
    );
    return rows[0]!.id;
  }

  /** Open a transaction on `client` with the tenant context already applied. */
  async function beginAsWorkspace(client: Client, workspaceId: string): Promise<void> {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
  }

  /** The PostgreSQL backend process id behind `client`'s session. */
  async function backendPid(client: Client): Promise<number> {
    const { rows } = await client.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`);
    return rows[0]!.pid;
  }

  /**
   * Poll `pg_stat_activity` from a THIRD connection until PostgreSQL itself
   * reports `pid` as actively waiting on a Lock.
   *
   * This is what makes the races below provably real rather than "two promises
   * that happened to be created together": the second transaction is observed,
   * by the server, to be parked on the first one's uncommitted work. If it
   * never blocks, the test fails loudly instead of quietly degrading into a
   * sequential proof.
   */
  async function awaitBlockedOnLock(pid: number, label: string): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const { rows } = await admin.query<{ wait_event_type: string | null; state: string | null }>(
        `SELECT wait_event_type, state FROM pg_stat_activity WHERE pid = $1`,
        [pid],
      );
      if (rows[0]?.state === "active" && rows[0]?.wait_event_type === "Lock") return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${label}: backend ${pid} never blocked inside PostgreSQL`);
  }

  /** Await an in-flight statement, then commit its transaction. */
  async function commitAfter(client: Client, pending: Promise<unknown>): Promise<"committed"> {
    await pending;
    await client.query("COMMIT");
    return "committed";
  }

  /** Run `fn` inside a rolled-back, tenant-scoped transaction on its own session. */
  async function withAppClient<T>(
    workspaceId: string,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const [client] = await openIndependentConnections(harness.appUri, 1);
    try {
      await beginAsWorkspace(client!, workspaceId);
      const result = await fn(client!);
      await client!.query("ROLLBACK");
      return result;
    } finally {
      await client!.end();
    }
  }

  /** Insert through the app role with tenant context, committing immediately. */
  async function insertCommitted(
    workspaceId: string,
    spec: BookingSpec,
  ): Promise<{ id: string; lower: string; upper: string }> {
    const [client] = await openIndependentConnections(harness.appUri, 1);
    try {
      await beginAsWorkspace(client!, workspaceId);
      const { rows } = await client!.query<{ id: string; lower: string; upper: string }>(
        INSERT,
        insertParams(workspaceId, spec),
      );
      await client!.query("COMMIT");
      const row = rows[0]!;
      // PostgreSQL renders `timestamptz` with a `+00:00` offset; normalise
      // through Temporal so the assertions below read as instants, never as
      // JavaScript `Date` values (ADR-010).
      return {
        id: row.id,
        lower: instant(row.lower).toString(),
        upper: instant(row.upper).toString(),
      };
    } finally {
      await client!.end();
    }
  }

  const confirm = (context: WorkspaceContext, startsAt: string) =>
    create.execute(context, {
      serviceId: SERVICE_ID,
      startsAt: instant(startsAt),
      serviceDurationMinutes: 60,
      preBufferMinutes: 0,
      postBufferMinutes: 0,
    });

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    pool = new Pool({ connectionString: harness.appUri });
    const repository = new BookingsRepository();
    create = new CreateBookingUseCase(pool, repository);
    reschedule = new RescheduleBookingUseCase(pool, repository);
    cancel = new CancelBookingUseCase(pool, repository);
    complete = new CompleteBookingUseCase(pool, repository);
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  // -------------------------------------------------------------------------
  // Migration 0010 — clean, populated-forward, and the production-safety case
  // -------------------------------------------------------------------------

  it("applies cleanly to an empty database and is idempotent", async () => {
    const result = await assertCleanMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
    });
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0010"]));
  });

  it("applies forward onto a table already populated with bookings and patterns", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0010",
      seed: async (client) => {
        const { rows: workspace } = await client.query<{ id: string }>(
          `INSERT INTO public.workspaces (name, slug) VALUES ('Forward 0010', 'forward-0010')
           RETURNING id`,
        );
        const workspaceId = workspace[0]!.id;
        // Representative rows for BOTH tables 0010 constrains, all of them
        // legal under the new invariants: two adjacent confirmed bookings, a
        // cancelled and a completed booking that deliberately overlap a
        // confirmed one (terminal rows must survive), and two adjacent
        // effective windows.
        await client.query(
          `INSERT INTO public.bookings
             (workspace_id, service_id, starts_at, service_duration_minutes,
              pre_buffer_minutes, post_buffer_minutes, status)
           VALUES
             ($1, $2, '2026-09-01T09:00:00Z', 60, 0, 0, 'confirmed'),
             ($1, $2, '2026-09-01T10:00:00Z', 60, 0, 0, 'confirmed'),
             ($1, $2, '2026-09-01T09:30:00Z', 60, 0, 0, 'cancelled'),
             ($1, $2, '2026-09-01T09:45:00Z', 60, 0, 0, 'completed')`,
          [workspaceId, SERVICE_ID],
        );
        await client.query(
          `INSERT INTO public.availability_patterns
             (workspace_id, timezone, weekly_rule, effective_from, effective_until)
           VALUES
             ($1, 'Europe/London', $2::jsonb, '2026-09-01', '2026-10-01'),
             ($1, 'Europe/London', $2::jsonb, '2026-10-01', NULL)`,
          [
            workspaceId,
            JSON.stringify([{ dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 }]),
          ],
        );
        return workspaceId;
      },
      verify: async (client, workspaceId) => {
        // Nothing was dropped, rewritten or "cleaned up" by the migration.
        const { rows: bookings } = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.bookings WHERE workspace_id = $1`,
          [workspaceId],
        );
        expect(bookings[0]!.count).toBe("4");

        const { rows: patterns } = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.availability_patterns
            WHERE workspace_id = $1`,
          [workspaceId],
        );
        expect(patterns[0]!.count).toBe("2");

        const { rows: constraints } = await client.query<{ conname: string }>(
          `SELECT conname FROM pg_constraint WHERE contype = 'x' ORDER BY conname`,
        );
        expect(constraints.map((row) => row.conname)).toEqual([
          "availability_patterns_no_overlapping_effective_window",
          "bookings_no_overlap",
        ]);
      },
    });
  });

  it("refuses to apply — and rolls 0010 back entirely — when existing rows already violate it", async () => {
    // PRODUCTION-SAFETY PROOF, not a hypothetical. This documents the real
    // PostgreSQL behaviour the migration header describes: validation happens
    // while the GiST index is built, a conflict raises 23P01, and because the
    // file carries no `-- slotnova:no-transaction` directive the WHOLE file
    // rolls back — no extension left half-installed, no orphan index, and
    // version 0010 absent from `schema_migrations`. Recovery is roll-forward
    // (ADR-020); the migration deliberately contains no cleanup/backfill that
    // would silently pick a loser between two real bookings.
    await withIsolatedDatabase(harness.adminUri, async ({ databaseUri }) => {
      await runMigrations({
        connectionString: databaseUri,
        migrationsDir: DEFAULT_MIGRATIONS_DIR,
        targetVersion: "0009",
      });

      const client = new Client({ connectionString: databaseUri });
      await client.connect();
      try {
        const { rows: workspace } = await client.query<{ id: string }>(
          `INSERT INTO public.workspaces (name, slug) VALUES ('Conflict', 'conflict') RETURNING id`,
        );
        await client.query(
          `INSERT INTO public.bookings
             (workspace_id, service_id, starts_at, service_duration_minutes,
              pre_buffer_minutes, post_buffer_minutes, status)
           VALUES ($1, $2, '2026-09-01T09:00:00Z', 60, 0, 0, 'confirmed'),
                  ($1, $2, '2026-09-01T09:30:00Z', 60, 0, 0, 'confirmed')`,
          [workspace[0]!.id, SERVICE_ID],
        );

        const failure = await runMigrations({
          connectionString: databaseUri,
          migrationsDir: DEFAULT_MIGRATIONS_DIR,
        }).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(failure).not.toBeNull();

        const { rows: applied } = await client.query<{ version: string }>(
          `SELECT version FROM public.schema_migrations WHERE version = '0010'`,
        );
        expect(applied).toHaveLength(0);

        const { rows: exclusions } = await client.query(
          `SELECT 1 FROM pg_constraint WHERE contype = 'x'`,
        );
        expect(exclusions).toHaveLength(0);

        // Both conflicting rows are still present and untouched — a migration
        // never decides which real booking loses.
        const { rows: survivors } = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.bookings`,
        );
        expect(survivors[0]!.count).toBe("2");
      } finally {
        await client.end();
      }
    });
  });

  // -------------------------------------------------------------------------
  // The constraint itself
  // -------------------------------------------------------------------------

  it("installs btree_gist and the named, workspace-scoped, confirmed-only exclusion constraint", async () => {
    const { rows: extensions } = await admin.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`,
    );
    expect(extensions.map((row) => row.extname)).toEqual(["btree_gist"]);

    const { rows } = await admin.query<{ conname: string; definition: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'public.bookings'::regclass AND contype = 'x'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.conname).toBe(OVERLAP_CONSTRAINT);

    const definition = rows[0]!.definition;
    // Workspace-scoped, not global: `workspace_id WITH =` is part of the key.
    expect(definition).toMatch(
      /EXCLUDE USING gist \(workspace_id WITH =, blocking_range WITH &&\)/u,
    );
    // Partial: terminal states never participate.
    expect(definition).toMatch(/WHERE \(+status = 'confirmed'::booking_status\)+/u);
    // No speculative resource/location/staff/client dimension in the key.
    for (const forbidden of ["resource_id", "location_id", "staff_id", "client_id"]) {
      expect(definition).not.toContain(forbidden);
    }
  });

  it("exposes the constraint name as structured metadata, not only as message text", async () => {
    const workspaceId = await seedWorkspace("metadata");
    await insertCommitted(workspaceId, { startsAt: "2026-09-07T09:00:00Z" });

    const error = await insertCommitted(workspaceId, { startsAt: "2026-09-07T09:30:00Z" }).then(
      () => null,
      (caught: unknown) => asPgError(caught),
    );

    expect(error).not.toBeNull();
    expect(error!.code).toBe(EXCLUSION_VIOLATION);
    expect(error!.constraint).toBe(OVERLAP_CONSTRAINT);
  });

  // -------------------------------------------------------------------------
  // Range semantics
  // -------------------------------------------------------------------------

  it("rejects an overlap caused only by buffers", async () => {
    const workspaceId = await seedWorkspace("buffer");
    // A: service 09:00-10:00 with a 30-minute POST buffer -> [09:00, 10:30).
    const a = await insertCommitted(workspaceId, {
      startsAt: "2026-09-07T09:00:00Z",
      postBufferMinutes: 30,
    });
    expect([a.lower, a.upper]).toEqual(["2026-09-07T09:00:00Z", "2026-09-07T10:30:00Z"]);

    // B's SERVICE starts at 10:15, strictly after A's service ended at 10:00 —
    // the only overlap is A's post-buffer.
    await expect(
      insertCommitted(workspaceId, { startsAt: "2026-09-07T10:15:00Z" }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION, constraint: OVERLAP_CONSTRAINT });

    // And symmetrically for a PRE buffer: C's service starts at 08:00 and ends
    // at 08:45, but its 30-minute pre-buffer reaches back to 07:30 — the
    // conflict below is produced purely by D's pre-buffer.
    const isolated = await seedWorkspace("prebuffer");
    const c = await insertCommitted(isolated, {
      startsAt: "2026-09-07T09:00:00Z",
      durationMinutes: 60,
    });
    expect([c.lower, c.upper]).toEqual(["2026-09-07T09:00:00Z", "2026-09-07T10:00:00Z"]);
    await expect(
      insertCommitted(isolated, {
        // Service 10:15-11:15, but a 30-minute pre-buffer reaches back to 09:45.
        startsAt: "2026-09-07T10:15:00Z",
        preBufferMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION, constraint: OVERLAP_CONSTRAINT });
  });

  it("allows half-open adjacency: one range's upper bound equals the next one's lower bound", async () => {
    const workspaceId = await seedWorkspace("adjacent");
    const a = await insertCommitted(workspaceId, {
      startsAt: "2026-09-07T09:00:00Z",
      postBufferMinutes: 15,
    });
    const b = await insertCommitted(workspaceId, {
      startsAt: "2026-09-07T10:30:00Z",
      preBufferMinutes: 15,
    });

    // The bounds themselves prove `[)` — no microsecond gap is inserted.
    expect(a.upper).toBe("2026-09-07T10:15:00Z");
    expect(b.lower).toBe("2026-09-07T10:15:00Z");
    expect(a.upper).toBe(b.lower);

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("2");

    // Read back from PostgreSQL rather than trusting the literals above.
    const { rows: bounds } = await admin.query<{ adjacent: boolean }>(
      `SELECT upper(a.blocking_range) = lower(b.blocking_range) AS adjacent
         FROM public.bookings a, public.bookings b
        WHERE a.id = $1 AND b.id = $2`,
      [a.id, b.id],
    );
    expect(bounds[0]!.adjacent).toBe(true);
  });

  it("allows the identical blocking range in two different workspaces", async () => {
    const workspaceA = await seedWorkspace("wsa");
    const workspaceB = await seedWorkspace("wsb");
    const spec: BookingSpec = { startsAt: "2026-09-07T09:00:00Z", preBufferMinutes: 10 };

    const a = await insertCommitted(workspaceA, spec);
    const b = await insertCommitted(workspaceB, spec);

    expect(a.lower).toBe(b.lower);
    expect(a.upper).toBe(b.upper);

    const { rows } = await admin.query<{ same: boolean }>(
      `SELECT a.blocking_range = b.blocking_range AS same
         FROM public.bookings a, public.bookings b
        WHERE a.id = $1 AND b.id = $2`,
      [a.id, b.id],
    );
    expect(rows[0]!.same).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Terminal states do not block
  // -------------------------------------------------------------------------

  it("lets a cancelled and a completed booking share a range with a confirmed one", async () => {
    for (const terminal of ["cancelled", "completed"] as const) {
      const workspaceId = await seedWorkspace(`terminal-${terminal}`);
      await insertCommitted(workspaceId, {
        startsAt: "2026-09-07T09:00:00Z",
        status: terminal,
      });
      const confirmed = await insertCommitted(workspaceId, {
        startsAt: "2026-09-07T09:15:00Z",
      });
      expect(confirmed.id).toEqual(expect.any(String));

      // Nothing was deleted — the historical row is still there.
      const { rows } = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.bookings WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(rows[0]!.count).toBe("2");
    }
  });

  it("releases capacity when a confirmed booking is cancelled, without deleting it", async () => {
    const workspaceId = await seedWorkspace("release");
    const context: WorkspaceContext = { workspaceId };

    const booking = await confirm(context, "2026-09-07T09:00:00Z");
    await expect(confirm(context, "2026-09-07T09:30:00Z")).rejects.toThrow(BookingOverlapError);

    await cancel.execute(context, {
      bookingId: booking.id,
      expectedVersion: booking.version,
      reason: "operator cancelled",
    });

    const replacement = await confirm(context, "2026-09-07T09:30:00Z");
    expect(replacement.status).toBe("confirmed");

    const { rows } = await admin.query<{ status: string; count: string }>(
      `SELECT status::text AS status, count(*)::text AS count
         FROM public.bookings WHERE workspace_id = $1 GROUP BY status ORDER BY status`,
      [workspaceId],
    );
    expect(rows).toEqual([
      { status: "cancelled", count: "1" },
      { status: "confirmed", count: "1" },
    ]);
  });

  it("releases capacity when a confirmed booking is completed", async () => {
    const workspaceId = await seedWorkspace("completed-release");
    const context: WorkspaceContext = { workspaceId };

    const booking = await confirm(context, "2026-09-07T09:00:00Z");
    await complete.execute(context, { bookingId: booking.id, expectedVersion: booking.version });

    const replacement = await confirm(context, "2026-09-07T09:30:00Z");
    expect(replacement.status).toBe("confirmed");
  });

  // -------------------------------------------------------------------------
  // TRUE concurrency — independent connections, explicit barrier
  // -------------------------------------------------------------------------

  it("blocks the second overlapping create inside PostgreSQL and fails it on bookings_no_overlap", async () => {
    const workspaceId = await seedWorkspace("race-create");
    const [a, b] = await openIndependentConnections(harness.appUri, 2);

    try {
      // Barrier: BOTH transactions are open and tenant-scoped before either
      // conflicting INSERT is issued, and neither commits until both
      // statements are in flight.
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);
      const pidB = await backendPid(b!);

      // A writes its (uncommitted) exclusion entry first.
      await a!.query(INSERT, insertParams(workspaceId, { startsAt: "2026-09-07T09:00:00Z" }));

      // B's overlapping INSERT now goes on the wire on its OWN session and
      // must BLOCK on A's uncommitted entry. `awaitBlockedOnLock` polls
      // `pg_stat_activity` from a third connection until PostgreSQL reports
      // that backend as waiting on a Lock — the proof that the DATABASE is
      // arbitrating, not JavaScript ordering. B cannot resolve until A commits.
      const insertB = b!.query(
        INSERT,
        insertParams(workspaceId, {
          startsAt: "2026-09-07T09:30:00Z",
        }),
      );
      await awaitBlockedOnLock(pidB, "overlapping create");

      await a!.query("COMMIT");

      const error = await insertB.then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error).not.toBeNull();
      expect(error!.code).toBe(EXCLUSION_VIOLATION);
      expect(error!.constraint).toBe(OVERLAP_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("lets exactly one of two simultaneously-issued overlapping creates commit", async () => {
    // The companion to the test above, with NO ordering imposed at all: both
    // INSERTs are put on the wire before either is awaited. PostgreSQL may
    // then resolve it either way -- the loser is rejected on
    // `bookings_no_overlap` (23P01) if one entry landed first, or chosen as a
    // deadlock victim (40P01) if each transaction ended up waiting on the
    // other's uncommitted entry. Both are the database arbitrating, and the
    // invariant that matters is identical: exactly one confirmed booking
    // survives. Pinning only 23P01 here would make the test flaky AND would
    // misdescribe real concurrent behaviour.
    const workspaceId = await seedWorkspace("race-create-simultaneous");
    const [a, b] = await openIndependentConnections(harness.appUri, 2);

    try {
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);

      const insertA = a!.query(
        INSERT,
        insertParams(workspaceId, {
          startsAt: "2026-09-07T09:00:00Z",
        }),
      );
      const insertB = b!.query(
        INSERT,
        insertParams(workspaceId, {
          startsAt: "2026-09-07T09:30:00Z",
        }),
      );
      const outcomes = await Promise.allSettled([
        commitAfter(a!, insertA),
        commitAfter(b!, insertB),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const failed = outcomes.filter((outcome) => outcome.status === "rejected");
      expect(failed).toHaveLength(1);
      const reason = asPgError((failed[0] as PromiseRejectedResult).reason);
      expect([EXCLUSION_VIOLATION, DEADLOCK_DETECTED]).toContain(reason.code);
      if (reason.code === EXCLUSION_VIOLATION) expect(reason.constraint).toBe(OVERLAP_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("blocks the second concurrent reschedule into the same range and fails it on bookings_no_overlap", async () => {
    const workspaceId = await seedWorkspace("race-reschedule");
    // Two confirmed bookings that do NOT currently conflict.
    const first = await insertCommitted(workspaceId, { startsAt: "2026-09-08T09:00:00Z" });
    const second = await insertCommitted(workspaceId, { startsAt: "2026-09-08T15:00:00Z" });

    const [a, b] = await openIndependentConnections(harness.appUri, 2);
    try {
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);
      const pidB = await backendPid(b!);

      // Both move into the SAME target hour, on independent connections.
      await a!.query(MOVE, [first.id, "2026-09-08T12:00:00Z"]);
      const moveB = b!.query(MOVE, [second.id, "2026-09-08T12:30:00Z"]);
      await awaitBlockedOnLock(pidB, "concurrent reschedule");

      await a!.query("COMMIT");

      const error = await moveB.then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error).not.toBeNull();
      expect(error!.code).toBe(EXCLUSION_VIOLATION);
      expect(error!.constraint).toBe(OVERLAP_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    // Exactly one booking sits in the contested hour; the loser kept its old
    // range (its whole transaction rolled back).
    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'
          AND blocking_range && tstzrange('2026-09-08T12:00:00Z', '2026-09-08T13:30:00Z', '[)')`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");

    // ...and nothing was lost: both bookings still exist and are confirmed.
    const { rows: all } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'`,
      [workspaceId],
    );
    expect(all[0]!.count).toBe("2");
  });

  it("lets exactly one of two simultaneously-issued reschedules into the same range commit", async () => {
    const workspaceId = await seedWorkspace("race-reschedule-simultaneous");
    const first = await insertCommitted(workspaceId, { startsAt: "2026-09-08T09:00:00Z" });
    const second = await insertCommitted(workspaceId, { startsAt: "2026-09-08T15:00:00Z" });

    const [a, b] = await openIndependentConnections(harness.appUri, 2);
    try {
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);

      const moveA = a!.query(MOVE, [first.id, "2026-09-08T12:00:00Z"]);
      const moveB = b!.query(MOVE, [second.id, "2026-09-08T12:30:00Z"]);
      const outcomes = await Promise.allSettled([commitAfter(a!, moveA), commitAfter(b!, moveB)]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const failed = outcomes.filter((outcome) => outcome.status === "rejected");
      expect(failed).toHaveLength(1);
      const reason = asPgError((failed[0] as PromiseRejectedResult).reason);
      expect([EXCLUSION_VIOLATION, DEADLOCK_DETECTED]).toContain(reason.code);
      if (reason.code === EXCLUSION_VIOLATION) expect(reason.constraint).toBe(OVERLAP_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.bookings
        WHERE workspace_id = $1 AND status = 'confirmed'
          AND blocking_range && tstzrange('2026-09-08T12:00:00Z', '2026-09-08T13:30:00Z', '[)')`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("lets exactly one of two genuinely concurrent same-version edits win", async () => {
    const workspaceId = await seedWorkspace("race-version");
    const booking = await insertCommitted(workspaceId, { startsAt: "2026-09-09T09:00:00Z" });

    const [a, b] = await openIndependentConnections(harness.appUri, 2);
    const GUARDED = `UPDATE public.bookings
                        SET starts_at = $3::timestamptz, version = $2 + 1, updated_at = now()
                      WHERE id = $1 AND version = $2 AND status = 'confirmed'
                  RETURNING version`;
    try {
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);

      // Barrier: BOTH transactions read the SAME current version first — the
      // exact read-then-guarded-write shape the reschedule use case performs.
      const readVersion = async (client: Client): Promise<number> => {
        const { rows } = await client.query<{ version: number }>(
          `SELECT version FROM public.bookings WHERE id = $1`,
          [booking.id],
        );
        return rows[0]!.version;
      };
      const versionA = await readVersion(a!);
      const versionB = await readVersion(b!);
      expect(versionA).toBe(1);
      expect(versionB).toBe(1);

      // Two DIFFERENT valid edits, both claiming expectedVersion 1, both to
      // ranges that conflict with nothing — so the ONLY thing that can
      // separate them is the version guard, not the exclusion constraint.
      const editA = a!.query(GUARDED, [booking.id, versionA, "2026-09-09T14:00:00Z"]);
      const editB = b!.query(GUARDED, [booking.id, versionB, "2026-09-09T18:00:00Z"]);

      const settle = async (
        client: Client,
        pending: Promise<{ rowCount: number | null }>,
      ): Promise<number> => {
        const result = await pending;
        await client.query("COMMIT");
        return result.rowCount ?? 0;
      };
      const [rowsA, rowsB] = await Promise.all([settle(a!, editA), settle(b!, editB)]);

      // Exactly one UPDATE matched a row. The loser matched none: it did not
      // silently overwrite the winner, it wrote nothing at all.
      expect([rowsA, rowsB].filter((count) => count === 1)).toHaveLength(1);
      expect([rowsA, rowsB].filter((count) => count === 0)).toHaveLength(1);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    // The version advanced EXACTLY once.
    const { rows } = await admin.query<{ version: number; starts_at: string }>(
      `SELECT version, to_json(starts_at) #>> '{}' AS starts_at
         FROM public.bookings WHERE id = $1`,
      [booking.id],
    );
    expect(rows[0]!.version).toBe(2);
    // ...and the surviving value is one of the two intents, never a blend.
    expect(["2026-09-09T14:00:00Z", "2026-09-09T18:00:00Z"]).toContain(
      instant(rows[0]!.starts_at).toString(),
    );
  });

  it("surfaces the loser of an application-level same-version race as a stale write", async () => {
    const workspaceId = await seedWorkspace("app-version");
    const context: WorkspaceContext = { workspaceId };
    const booking = await confirm(context, "2026-09-10T09:00:00Z");

    // Two independent pools, so the two use-case transactions cannot share a
    // pooled client. Both carry the SAME expectedVersion.
    const poolA = new Pool({ connectionString: harness.appUri, max: 1 });
    const poolB = new Pool({ connectionString: harness.appUri, max: 1 });
    try {
      const repository = new BookingsRepository();
      const rescheduleA = new RescheduleBookingUseCase(poolA, repository);
      const rescheduleB = new RescheduleBookingUseCase(poolB, repository);

      const outcomes = await Promise.allSettled([
        rescheduleA.execute(context, {
          bookingId: booking.id,
          expectedVersion: booking.version,
          startsAt: instant("2026-09-10T14:00:00Z"),
        }),
        rescheduleB.execute(context, {
          bookingId: booking.id,
          expectedVersion: booking.version,
          startsAt: instant("2026-09-10T18:00:00Z"),
        }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const failed = outcomes.filter((outcome) => outcome.status === "rejected");
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(StaleBookingVersionError);
    } finally {
      await Promise.all([poolA.end(), poolB.end()]);
    }

    const { rows } = await admin.query<{ version: number }>(
      `SELECT version FROM public.bookings WHERE id = $1`,
      [booking.id],
    );
    expect(rows[0]!.version).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Error translation
  // -------------------------------------------------------------------------

  it("translates the booking exclusion violation into BookingOverlapError on create", async () => {
    const workspaceId = await seedWorkspace("translate-create");
    const context: WorkspaceContext = { workspaceId };
    await confirm(context, "2026-09-11T09:00:00Z");

    const error = await confirm(context, "2026-09-11T09:30:00Z").then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BookingOverlapError);
    expect((error as BookingOverlapError).name).toBe("BookingOverlapError");
  });

  it("translates the booking exclusion violation into BookingOverlapError on reschedule", async () => {
    const workspaceId = await seedWorkspace("translate-reschedule");
    const context: WorkspaceContext = { workspaceId };
    await confirm(context, "2026-09-12T09:00:00Z");
    const movable = await confirm(context, "2026-09-12T15:00:00Z");

    await expect(
      reschedule.execute(context, {
        bookingId: movable.id,
        expectedVersion: movable.version,
        startsAt: instant("2026-09-12T09:30:00Z"),
      }),
    ).rejects.toThrow(BookingOverlapError);
  });

  it("does not swallow an unrelated integrity failure as an overlap", async () => {
    const workspaceId = await seedWorkspace("unrelated");
    // A CHECK violation (negative buffer) is SQLSTATE 23514, not 23P01, and a
    // foreign-key violation is 23503. Neither may be reported as an overlap.
    const checkViolation = await insertCommitted(workspaceId, {
      startsAt: "2026-09-13T09:00:00Z",
      durationMinutes: 0,
    }).then(
      () => null,
      (caught: unknown) => asPgError(caught),
    );
    expect(checkViolation?.code).toBe("23514");
    expect(checkViolation?.constraint).not.toBe(OVERLAP_CONSTRAINT);

    const fkViolation = await insertCommitted("00000000-0000-4000-8000-0000000000ff", {
      startsAt: "2026-09-13T09:00:00Z",
    }).then(
      () => null,
      (caught: unknown) => asPgError(caught),
    );
    // Either the tenant FK (23503) or the RLS WITH CHECK (42501) — never an
    // overlap, and never SQLSTATE 23P01.
    expect(["23503", "42501"]).toContain(fkViolation?.code);
    expect(fkViolation?.code).not.toBe(EXCLUSION_VIOLATION);
  });

  // -------------------------------------------------------------------------
  // RLS regression
  // -------------------------------------------------------------------------

  it("keeps Booking RLS enabled + forced and the constraint effective through the app role", async () => {
    const { rows } = await admin.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE oid = 'public.bookings'::regclass`,
    );
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    // The constraint is a table-level invariant, so it fires even for a row
    // the current tenant context cannot SEE. Workspace B may not read
    // workspace A's booking, and also may not create one that conflicts with
    // its OWN — proving isolation and enforcement coexist.
    const workspaceA = await seedWorkspace("rls-a");
    const workspaceB = await seedWorkspace("rls-b");
    await insertCommitted(workspaceA, { startsAt: "2026-09-14T09:00:00Z" });
    await insertCommitted(workspaceB, { startsAt: "2026-09-14T09:00:00Z" });

    const visible = await withAppClient(workspaceB, (client) =>
      client.query(`SELECT workspace_id FROM public.bookings`),
    );
    expect(
      visible.rows.every((row) => (row as { workspace_id: string }).workspace_id === workspaceB),
    ).toBe(true);

    await expect(
      insertCommitted(workspaceB, { startsAt: "2026-09-14T09:30:00Z" }),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION, constraint: OVERLAP_CONSTRAINT });
  });

  it("keeps the workspace owner role isolated: no DELETE grant was added", async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'bookings' AND grantee = $1
        ORDER BY privilege_type`,
      [harness.appRole],
    );
    expect(rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
