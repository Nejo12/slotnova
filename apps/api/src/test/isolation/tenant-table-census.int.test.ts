/**
 * Phase-2 exit proof for SC-005 ("**100%** of Phase-2 tenant-owned tables
 * pass an automated RLS isolation test").
 *
 * Every individual Phase-2 table already has a hand-written isolation suite
 * next to the module that owns it (`catalog`, `scheduling`, `booking`,
 * `platform/idempotency`) and Phase-1's `tenant-tables.int.test.ts` covers
 * the foundation tables. What none of them can prove is the *quantifier*:
 * each asserts the tables it already knows about, so a tenant-owned table
 * that nobody remembered would be silently uncovered and every suite would
 * still be green.
 *
 * This test closes that by discovering tenant ownership from the live
 * catalog instead of from a hand-maintained list — `findTenantTables` finds
 * every base table carrying a `workspace_id` column — and then asserting
 * two things about the discovered set:
 *
 *   1. all of it is RLS enabled + FORCE + policied; and
 *   2. it contains exactly the tables the accepted Phase-1 + Phase-2 data
 *      model says exist, so a NEW tenant table cannot appear without this
 *      test failing and forcing an explicit isolation suite for it.
 *
 * It deliberately does not re-prove read/write isolation per table; the
 * per-module suites own that and are cited in `docs/phase-2-exit.md`.
 */
import { Client, runMigrations } from "@slotnova/db";
import {
  DEFAULT_POSTGRES_IMAGE,
  assertRlsCoverage,
  findTenantTables,
  startPostgres,
  type PostgresHarness,
} from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The accepted tenant-ownership matrix across `specs/001-platform-foundation-shell`
 * (`data-model.md`) and `specs/002-catalog-scheduling-booking/data-model.md`.
 * Phase 1: locations, memberships, invitations, audit_records.
 * Phase 2: service_categories, services (PR-01), idempotent_requests (PR-02A),
 * availability_patterns, availability_exceptions (PR-04), bookings (PR-05).
 *
 * `workspaces` itself is NOT here: it is the tenant root, keyed by `id`, and
 * carries no `workspace_id` column.
 */
const EXPECTED_TENANT_TABLES = [
  "audit_records",
  "availability_exceptions",
  "availability_patterns",
  "bookings",
  "idempotent_requests",
  "invitations",
  "locations",
  "memberships",
  "service_categories",
  "services",
] as const;

/**
 * Tables that carry `workspace_id` as **context** rather than as ownership.
 * `data-model.md`'s tenant-ownership matrix places `outbox_records` here
 * deliberately (migration `0001_platform_outbox.sql` states it in full): the
 * column is NULLABLE because platform-level events belong to no single
 * workspace, and the worker sets tenant context per dispatch under an
 * elevated role rather than reading rows under a per-row policy.
 *
 * This list is the ONLY hand-maintained exception, and the census below
 * proves the distinction is real rather than asserted: a context-carrying
 * table is exactly one whose `workspace_id` is nullable.
 */
const CONTEXT_ONLY_TABLES = ["outbox_records"] as const;

const PHASE_2_TENANT_TABLES = [
  "availability_exceptions",
  "availability_patterns",
  "bookings",
  "idempotent_requests",
  "service_categories",
  "services",
] as const;

describe("tenant-table census (real PostgreSQL, Phase-2 exit / SC-005)", () => {
  let harness: PostgresHarness;
  let admin: Client;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
  }, 180_000);

  afterAll(async () => {
    await admin?.end();
    await harness?.stop();
  });

  /**
   * A table is tenant-OWNED when `workspace_id` is NOT NULL: every row then
   * belongs to exactly one workspace and a policy can decide it. A nullable
   * `workspace_id` is context, not ownership.
   */
  async function census(): Promise<{ owned: string[]; contextOnly: string[] }> {
    const candidates = await findTenantTables(admin, { schemas: ["public"] });
    expect(candidates.every((t) => t.schema === "public")).toBe(true);

    const { rows } = await admin.query<{ table: string; notnull: boolean }>(
      `SELECT c.relname AS "table", a.attnotnull AS notnull
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'workspace_id'
                            AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relkind = 'r' AND c.relname = ANY($1)`,
      [candidates.map((t) => t.table)],
    );

    return {
      owned: rows
        .filter((r) => r.notnull)
        .map((r) => r.table)
        .sort(),
      contextOnly: rows
        .filter((r) => !r.notnull)
        .map((r) => r.table)
        .sort(),
    };
  }

  it("discovers exactly the accepted tenant-owned tables and no undeclared one", async () => {
    const { owned, contextOnly } = await census();

    expect(owned).toEqual([...EXPECTED_TENANT_TABLES]);
    // The one documented exception, and proof it is the ONLY one.
    expect(contextOnly).toEqual([...CONTEXT_ONLY_TABLES]);
  });

  it("has RLS enabled + forced + a policy on 100% of the discovered tenant-owned tables", async () => {
    const { owned } = await census();

    const statuses = await assertRlsCoverage(
      admin,
      owned.map((table) => ({ schema: "public", table })),
    );

    expect(statuses).toHaveLength(owned.length);
    expect(statuses.every((s) => s.rlsEnabled && s.rlsForced && s.policyCount >= 1)).toBe(true);
    // Guard against a vacuous pass if discovery ever returned nothing.
    expect(statuses.length).toBeGreaterThanOrEqual(EXPECTED_TENANT_TABLES.length);
  });

  it("covers every Phase-2 tenant table specifically", async () => {
    const { owned } = await census();

    for (const table of PHASE_2_TENANT_TABLES) {
      expect(owned).toContain(table);
    }

    await expect(
      assertRlsCoverage(
        admin,
        PHASE_2_TENANT_TABLES.map((table) => ({ schema: "public", table })),
      ),
    ).resolves.toHaveLength(PHASE_2_TENANT_TABLES.length);
  });

  it("introduced no client/customer, staff, resource or location dimension on a Phase-2 table", async () => {
    const { rows } = await admin.query<{ table: string; column: string }>(
      `SELECT c.relname AS "table", a.attname AS "column"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relkind = 'r'
          AND c.relname = ANY($1)
          AND a.attname = ANY($2)`,
      [
        [...PHASE_2_TENANT_TABLES],
        ["client_id", "customer_id", "staff_id", "resource_id", "location_id"],
      ],
    );

    expect(rows).toEqual([]);
  });
});
