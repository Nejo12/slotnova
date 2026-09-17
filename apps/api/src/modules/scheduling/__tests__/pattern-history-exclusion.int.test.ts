/**
 * Issue #70 (Phase 2 PR-06) — the ratified Scheduling pattern-history
 * invariant as a real PostgreSQL exclusion constraint.
 *
 * The Founder ratified the invariant PR-04 proposed (PR #67): at most one
 * `AvailabilityPattern` may be effective for a workspace on any given date;
 * effective windows are half-open `[effective_from, effective_until)`, so
 * adjacent windows are valid and overlapping ones are not; there is NO
 * precedence / newest-wins rule, because `resolve` must never have to choose
 * between two simultaneously-effective patterns.
 *
 * PR-04 enforced it in the application layer under a per-workspace advisory
 * lock, because `EXCLUDE USING gist` needs `btree_gist` and that extension was
 * assigned to PR-06. PR-06 legitimately installs it, so the invariant is now
 * promoted to the strongest boundary. The SEMANTICS ARE UNCHANGED — this file
 * asserts exactly the cases `existsOverlappingEffectiveWindow` already
 * asserted in `schema.int.test.ts`, but proves the DATABASE rejects them even
 * when the application guard is bypassed entirely.
 *
 * The advisory-lock check stays: it is the friendly deterministic 422 path
 * (`OverlappingEffectivePatternError`). The constraint is defense in depth,
 * and a violation that still reaches the database through a race is mapped to
 * that same domain condition rather than leaking SQL detail.
 */
import { Client, Pool, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  openIndependentConnections,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withWorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import {
  CreateAvailabilityPatternUseCase,
  OverlappingEffectivePatternError,
} from "../application/create-availability-pattern.use-case.js";
import { AvailabilityPatternsRepository } from "../infrastructure/repositories/availability-patterns.repository.js";

const PATTERN_CONSTRAINT = "availability_patterns_no_overlapping_effective_window";
const EXCLUSION_VIOLATION = "23P01";
const DEADLOCK_DETECTED = "40P01";

const WEEKLY_RULE = [{ dayOfWeek: 1, startMinuteOfDay: 540, endMinuteOfDay: 1020 }] as const;

interface PgError extends Error {
  readonly code?: string;
  readonly constraint?: string;
}

const asPgError = (error: unknown): PgError => error as PgError;

/**
 * Raw insert, deliberately NOT the use case: these tests assert what
 * PostgreSQL does when the application-layer advisory-lock guard is bypassed,
 * which is the only honest way to prove the database is the boundary.
 */
const INSERT = `
  INSERT INTO public.availability_patterns
    (workspace_id, timezone, weekly_rule, effective_from, effective_until)
  VALUES ($1, 'Europe/London', $2::jsonb, $3::date, $4::date)
  RETURNING id`;

describe("scheduling pattern-history exclusion constraint (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let createPattern: CreateAvailabilityPatternUseCase;

  async function seedWorkspace(label: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Pattern excl ${label} ${suffix}`, `pattern-excl-${label}-${suffix}`],
    );
    return rows[0]!.id;
  }

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
   * reports `pid` as actively waiting on a Lock — the proof that the second
   * transaction is parked on the first one's uncommitted work rather than
   * merely being started later by JavaScript.
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

  /** Insert straight through the app role, committing immediately. */
  async function insertWindow(
    workspaceId: string,
    from: string | null,
    until: string | null,
  ): Promise<string> {
    const [client] = await openIndependentConnections(harness.appUri, 1);
    try {
      await beginAsWorkspace(client!, workspaceId);
      const { rows } = await client!.query<{ id: string }>(INSERT, [
        workspaceId,
        JSON.stringify(WEEKLY_RULE),
        from,
        until,
      ]);
      await client!.query("COMMIT");
      return rows[0]!.id;
    } finally {
      await client!.end();
    }
  }

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    pool = new Pool({ connectionString: harness.appUri });
    createPattern = new CreateAvailabilityPatternUseCase(
      pool,
      new AvailabilityPatternsRepository(),
    );
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("creates the named, workspace-scoped, half-open effective-window exclusion constraint", async () => {
    const { rows } = await admin.query<{ conname: string; definition: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'public.availability_patterns'::regclass AND contype = 'x'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.conname).toBe(PATTERN_CONSTRAINT);

    const definition = rows[0]!.definition;
    expect(definition).toContain("EXCLUDE USING gist");
    expect(definition).toContain("workspace_id WITH =");
    // Half-open `[)` — the same bound semantics the Founder fixed for
    // `effectiveUntil`, not `[]` and not `(]`.
    expect(definition).toContain("'[)'");
    expect(definition).toContain("WITH &&");
    // Unconditional: unlike Booking there is no status column, so there is no
    // partial predicate to get wrong.
    expect(definition).not.toContain("WHERE");
  });

  it("rejects two overlapping effective windows in one workspace at the database boundary", async () => {
    const workspaceId = await seedWorkspace("overlap");
    await insertWindow(workspaceId, "2026-09-01", "2026-10-01");

    const overlapping: [string, string | null, string | null][] = [
      ["identical window", "2026-09-01", "2026-10-01"],
      ["window inside it", "2026-09-10", "2026-09-12"],
      ["window straddling its start", "2026-08-01", "2026-09-02"],
      ["window straddling its end", "2026-09-28", "2026-10-15"],
      ["fully unbounded", null, null],
      ["unbounded below, ending inside it", null, "2026-09-15"],
      ["unbounded above, starting inside it", "2026-09-15", null],
    ];

    for (const [label, from, until] of overlapping) {
      const error = await insertWindow(workspaceId, from, until).then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error, label).not.toBeNull();
      expect(error!.code, label).toBe(EXCLUSION_VIOLATION);
      expect(error!.constraint, label).toBe(PATTERN_CONSTRAINT);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("accepts adjacent windows: [a,b) followed by [b,c)", async () => {
    const workspaceId = await seedWorkspace("adjacent");
    await insertWindow(workspaceId, "2026-09-01", "2026-10-01");
    await insertWindow(workspaceId, "2026-10-01", "2026-11-01");
    // ...and a window that ends exactly where the first begins.
    await insertWindow(workspaceId, "2026-08-01", "2026-09-01");

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("3");
  });

  it("accepts the same effective window in two different workspaces", async () => {
    const workspaceA = await seedWorkspace("wsa");
    const workspaceB = await seedWorkspace("wsb");
    await insertWindow(workspaceA, "2026-09-01", "2026-10-01");
    await insertWindow(workspaceB, "2026-09-01", "2026-10-01");

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns
        WHERE workspace_id = ANY($1::uuid[])`,
      [[workspaceA, workspaceB]],
    );
    expect(rows[0]!.count).toBe("2");
  });

  it("treats a NULL effective_from as an unbounded lower bound", async () => {
    const workspaceId = await seedWorkspace("null-lower");
    await insertWindow(workspaceId, null, "2026-09-01");

    // Adjacent above is still fine (exclusive upper bound).
    await insertWindow(workspaceId, "2026-09-01", "2026-10-01");

    // But anything reaching back before 2026-09-01 collides with the
    // unbounded-below window, however far back it starts.
    for (const from of ["2020-01-01", "1970-01-01"]) {
      const error = await insertWindow(workspaceId, from, "2026-08-31").then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error?.constraint, from).toBe(PATTERN_CONSTRAINT);
    }
  });

  it("treats a NULL effective_until as an unbounded upper bound", async () => {
    const workspaceId = await seedWorkspace("null-upper");
    await insertWindow(workspaceId, "2026-09-01", null);

    // Adjacent below is fine.
    await insertWindow(workspaceId, "2026-08-01", "2026-09-01");

    for (const until of ["2030-01-01", null]) {
      const error = await insertWindow(workspaceId, "2027-01-01", until).then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error?.constraint, String(until)).toBe(PATTERN_CONSTRAINT);
    }
  });

  it("treats two NULL bounds as every date, so nothing else can coexist with it", async () => {
    const workspaceId = await seedWorkspace("null-both");
    await insertWindow(workspaceId, null, null);

    for (const [from, until] of [
      ["2026-09-01", "2026-10-01"],
      [null, "2026-09-01"],
      ["2026-09-01", null],
      [null, null],
    ] as [string | null, string | null][]) {
      const error = await insertWindow(workspaceId, from, until).then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error?.constraint, `${from} -> ${until}`).toBe(PATTERN_CONSTRAINT);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("keeps the friendly application-level 422 path as the ordinary outcome", async () => {
    const workspaceId = await seedWorkspace("friendly");
    const context = { workspaceId };

    await createPattern.execute(context, {
      timezone: "Europe/London",
      weeklyRule: [...WEEKLY_RULE],
      effectiveFrom: null,
      effectiveUntil: null,
    });

    const error = await createPattern
      .execute(context, {
        timezone: "Europe/London",
        weeklyRule: [...WEEKLY_RULE],
        effectiveFrom: null,
        effectiveUntil: null,
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    // The advisory-lock guard, not the constraint, produced this — and it
    // carries no SQLSTATE, constraint name or other persistence detail.
    expect(error).toBeInstanceOf(OverlappingEffectivePatternError);
    expect(asPgError(error).code).toBeUndefined();
    expect(asPgError(error).constraint).toBeUndefined();
  });

  it("maps a constraint violation that still reaches the database to the same domain condition", async () => {
    const workspaceId = await seedWorkspace("mapped");
    // Insert a window WITHOUT taking the advisory lock, i.e. exactly what a
    // racing writer that slipped past the application guard would leave
    // behind. The use case's own overlap read runs in its transaction, so this
    // simulates the committed-underneath-us case the constraint exists for.
    await insertWindow(workspaceId, "2026-09-01", "2026-10-01");

    await expect(
      createPattern.execute(
        { workspaceId },
        {
          timezone: "Europe/London",
          weeklyRule: [...WEEKLY_RULE],
          effectiveFrom: null,
          effectiveUntil: null,
        },
      ),
    ).rejects.toBeInstanceOf(OverlappingEffectivePatternError);
  });

  it("blocks a concurrent overlapping insert inside PostgreSQL and fails it on the constraint", async () => {
    const workspaceId = await seedWorkspace("race-blocked");
    const [a, b] = await openIndependentConnections(harness.appUri, 2);
    const rule = JSON.stringify(WEEKLY_RULE);
    try {
      // Barrier: both transactions open and tenant-scoped, neither committed,
      // before the conflicting statement is issued. NEITHER takes the
      // application advisory lock — this is the database boundary on its own.
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);
      const pidB = await backendPid(b!);

      await a!.query(INSERT, [workspaceId, rule, "2026-09-01", "2026-10-01"]);

      const insertB = b!.query(INSERT, [workspaceId, rule, "2026-09-15", "2026-10-15"]);
      await awaitBlockedOnLock(pidB, "overlapping pattern window");

      await a!.query("COMMIT");

      const error = await insertB.then(
        () => null,
        (caught: unknown) => asPgError(caught),
      );
      expect(error).not.toBeNull();
      expect(error!.code).toBe(EXCLUSION_VIOLATION);
      expect(error!.constraint).toBe(PATTERN_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("lets exactly one of two simultaneously-issued overlapping inserts commit", async () => {
    // No ordering imposed: both statements go on the wire before either is
    // awaited. PostgreSQL resolves it either as an exclusion violation
    // (23P01) or by picking a deadlock victim (40P01) when each transaction
    // ends up waiting on the other's uncommitted entry. Both are the database
    // arbitrating; the surviving invariant is identical.
    const workspaceId = await seedWorkspace("race-simultaneous");
    const [a, b] = await openIndependentConnections(harness.appUri, 2);
    try {
      await beginAsWorkspace(a!, workspaceId);
      await beginAsWorkspace(b!, workspaceId);

      const rule = JSON.stringify(WEEKLY_RULE);
      const insertA = a!.query(INSERT, [workspaceId, rule, "2026-09-01", "2026-10-01"]);
      const insertB = b!.query(INSERT, [workspaceId, rule, "2026-09-15", "2026-10-15"]);

      const settle = async (client: Client, pending: Promise<unknown>): Promise<"committed"> => {
        await pending;
        await client.query("COMMIT");
        return "committed";
      };
      const outcomes = await Promise.allSettled([settle(a!, insertA), settle(b!, insertB)]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const failed = outcomes.filter((outcome) => outcome.status === "rejected");
      expect(failed).toHaveLength(1);
      const reason = asPgError((failed[0] as PromiseRejectedResult).reason);
      expect([EXCLUSION_VIOLATION, DEADLOCK_DETECTED]).toContain(reason.code);
      if (reason.code === EXCLUSION_VIOLATION) expect(reason.constraint).toBe(PATTERN_CONSTRAINT);
    } finally {
      await Promise.allSettled([a!.query("ROLLBACK"), b!.query("ROLLBACK")]);
      await Promise.all([a!.end(), b!.end()]);
    }

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.availability_patterns WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("introduces no precedence rule: a second simultaneously-effective pattern cannot exist", async () => {
    const workspaceId = await seedWorkspace("precedence");
    await insertWindow(workspaceId, "2026-09-01", "2026-10-01");
    await expect(insertWindow(workspaceId, "2026-09-01", "2026-10-01")).rejects.toMatchObject({
      constraint: PATTERN_CONSTRAINT,
    });

    // Therefore every date resolves to at most one pattern, by construction —
    // no newest-wins / highest-id-wins tie-break exists anywhere.
    const { rows } = await withWorkspaceContext(pool, { workspaceId }, (tx) =>
      tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.availability_patterns
          WHERE daterange(effective_from, effective_until, '[)') @> '2026-09-15'::date`,
      ),
    );
    expect(rows[0]!.count).toBe("1");
  });

  it("keeps Scheduling RLS enabled + forced after the constraint is added", async () => {
    for (const table of ["availability_patterns", "availability_exceptions"]) {
      const { rows } = await admin.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, [
        `public.${table}`,
      ]);
      expect(rows[0], table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    }

    // Workspace A's window does not constrain workspace B, and B still cannot
    // see A's row.
    const workspaceA = await seedWorkspace("rls-a");
    const workspaceB = await seedWorkspace("rls-b");
    await insertWindow(workspaceA, null, null);
    await insertWindow(workspaceB, null, null);

    const visible = await withWorkspaceContext(pool, { workspaceId: workspaceB }, (tx) =>
      tx.query<{ workspace_id: string }>(`SELECT workspace_id FROM public.availability_patterns`),
    );
    expect(visible.rows.map((row) => row.workspace_id)).toEqual([workspaceB]);

    // The constraint still fires for B's own workspace even though A's
    // conflicting-looking row is invisible to it.
    await expect(insertWindow(workspaceB, "2026-09-01", "2026-10-01")).rejects.toMatchObject({
      constraint: PATTERN_CONSTRAINT,
    });
  });
});
