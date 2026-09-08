/**
 * Generic RLS-coverage assertion.
 *
 * FR-029 / FR-033 / SC-003 / SC-011: every tenant-owned table must have
 * row-level security **enabled**, **forced** (`FORCE ROW LEVEL SECURITY`, so the
 * table owner is not exempt), and at least one applicable policy.
 *
 * This helper is deliberately schema-agnostic. It does not know about `identity`
 * or any product schema (those arrive in later PRs); the caller supplies the
 * list of tenant-owned tables, or discovers them with {@link findTenantTables}.
 */
import type { ClientBase } from "pg";

export interface TableRef {
  schema?: string;
  table: string;
}

export interface TableRlsStatus {
  readonly schema: string;
  readonly table: string;
  readonly exists: boolean;
  readonly rlsEnabled: boolean;
  readonly rlsForced: boolean;
  readonly policyCount: number;
  readonly compliant: boolean;
}

function normalise(ref: TableRef | string): { schema: string; table: string } {
  if (typeof ref === "string") {
    const parts = ref.split(".");
    return parts.length === 2
      ? { schema: parts[0] as string, table: parts[1] as string }
      : { schema: "public", table: ref };
  }
  return { schema: ref.schema ?? "public", table: ref.table };
}

/** Inspect RLS state for a set of tables. Unknown tables come back `exists: false`. */
export async function getRlsCoverage(
  client: ClientBase,
  tables: ReadonlyArray<TableRef | string>,
): Promise<TableRlsStatus[]> {
  const refs = tables.map(normalise);
  if (refs.length === 0) return [];

  const values = refs.map((_, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::text)`).join(", ");
  const params = refs.flatMap((r) => [r.schema, r.table]);

  const { rows } = await client.query<{
    schema: string;
    table: string;
    rls_enabled: boolean;
    rls_forced: boolean;
    policy_count: string;
  }>(
    `
    WITH requested(schema, "table") AS (VALUES ${values})
    SELECT requested.schema,
           requested."table",
           c.relrowsecurity      AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           coalesce((SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid), 0) AS policy_count
      FROM requested
      LEFT JOIN pg_namespace n ON n.nspname = requested.schema
      LEFT JOIN pg_class c
             ON c.relnamespace = n.oid
            AND c.relname = requested."table"
            AND c.relkind = 'r'
    `,
    params,
  );

  const byKey = new Map(rows.map((r) => [`${r.schema}.${r.table}`, r]));

  return refs.map((ref) => {
    const row = byKey.get(`${ref.schema}.${ref.table}`);
    const exists = row?.rls_enabled !== undefined && row?.rls_enabled !== null;
    const rlsEnabled = Boolean(row?.rls_enabled);
    const rlsForced = Boolean(row?.rls_forced);
    const policyCount = row ? Number(row.policy_count) : 0;
    return {
      schema: ref.schema,
      table: ref.table,
      exists,
      rlsEnabled,
      rlsForced,
      policyCount,
      compliant: exists && rlsEnabled && rlsForced && policyCount >= 1,
    };
  });
}

/**
 * Throw unless **every** listed table has RLS enabled + forced + at least one
 * policy. Returns the full status list on success.
 */
export async function assertRlsCoverage(
  client: ClientBase,
  tables: ReadonlyArray<TableRef | string>,
): Promise<TableRlsStatus[]> {
  const statuses = await getRlsCoverage(client, tables);
  const failures = statuses.filter((s) => !s.compliant);
  if (failures.length > 0) {
    const detail = failures
      .map((s) => {
        if (!s.exists) return `  - ${s.schema}.${s.table}: table not found`;
        const missing: string[] = [];
        if (!s.rlsEnabled) missing.push("RLS not enabled");
        if (!s.rlsForced) missing.push("RLS not forced");
        if (s.policyCount < 1) missing.push("no policy");
        return `  - ${s.schema}.${s.table}: ${missing.join(", ")}`;
      })
      .join("\n");
    throw new Error(`RLS coverage assertion failed for ${failures.length} table(s):\n${detail}`);
  }
  return statuses;
}

/**
 * Discover candidate tenant-owned tables: base tables that carry a scoping
 * column (default `workspace_id`). Later module tests can feed the result
 * straight into {@link assertRlsCoverage}.
 */
export async function findTenantTables(
  client: ClientBase,
  options: { column?: string; schemas?: readonly string[] } = {},
): Promise<{ schema: string; table: string }[]> {
  const { column = "workspace_id", schemas } = options;
  const params: unknown[] = [column];
  let schemaFilter = "n.nspname NOT IN ('pg_catalog', 'information_schema')";
  if (schemas && schemas.length > 0) {
    params.push(schemas);
    schemaFilter = "n.nspname = ANY($2)";
  }

  const { rows } = await client.query<{ schema: string; table: string }>(
    `
    SELECT n.nspname AS schema, c.relname AS "table"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = $1 AND a.attnum > 0 AND NOT a.attisdropped
     WHERE c.relkind = 'r'
       AND ${schemaFilter}
     ORDER BY n.nspname, c.relname
    `,
    params,
  );
  return rows.map((r) => ({ schema: r.schema, table: r.table }));
}
