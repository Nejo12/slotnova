import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "pg";

import { withIsolatedSchema } from "../isolation.js";
import { startPostgres, type PostgresHarness } from "../pg-container.js";
import { assertRlsCoverage, findTenantTables, getRlsCoverage } from "../rls-coverage.js";

let harness: PostgresHarness;
let admin: Client;

beforeAll(async () => {
  harness = await startPostgres();
  admin = new Client({ connectionString: harness.adminUri });
  await admin.connect();
}, 180_000);

afterAll(async () => {
  await admin?.end();
  await harness?.stop();
});

async function createTenantTable(
  client: Client,
  schema: string,
  name: string,
  opts: { enableRls: boolean; forceRls: boolean; policy: boolean },
): Promise<void> {
  await client.query(
    `CREATE TABLE ${schema}.${name} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL)`,
  );
  if (opts.enableRls) {
    await client.query(`ALTER TABLE ${schema}.${name} ENABLE ROW LEVEL SECURITY`);
  }
  if (opts.forceRls) {
    await client.query(`ALTER TABLE ${schema}.${name} FORCE ROW LEVEL SECURITY`);
  }
  if (opts.policy) {
    await client.query(
      `CREATE POLICY ${name}_ws_isolation ON ${schema}.${name}
         USING (workspace_id = current_setting('app.workspace_id', true)::uuid)`,
    );
  }
}

describe("generic RLS-coverage assertion (T012)", () => {
  it("passes only when a table has RLS enabled + forced + a policy", async () => {
    await withIsolatedSchema(admin, async (schema) => {
      await createTenantTable(admin, schema, "compliant", {
        enableRls: true,
        forceRls: true,
        policy: true,
      });
      await createTenantTable(admin, schema, "no_force", {
        enableRls: true,
        forceRls: false,
        policy: true,
      });
      await createTenantTable(admin, schema, "no_policy", {
        enableRls: true,
        forceRls: true,
        policy: false,
      });

      const statuses = await getRlsCoverage(admin, [
        { schema, table: "compliant" },
        { schema, table: "no_force" },
        { schema, table: "no_policy" },
        { schema, table: "missing" },
      ]);

      const byName = new Map(statuses.map((s) => [s.table, s]));
      expect(byName.get("compliant")?.compliant).toBe(true);
      expect(byName.get("no_force")?.compliant).toBe(false);
      expect(byName.get("no_force")?.rlsForced).toBe(false);
      expect(byName.get("no_policy")?.policyCount).toBe(0);
      expect(byName.get("missing")?.exists).toBe(false);

      await expect(
        assertRlsCoverage(admin, [{ schema, table: "compliant" }]),
      ).resolves.toHaveLength(1);
      await expect(
        assertRlsCoverage(admin, [
          { schema, table: "compliant" },
          { schema, table: "no_force" },
        ]),
      ).rejects.toThrow(/RLS not forced/);
      await expect(assertRlsCoverage(admin, [{ schema, table: "missing" }])).rejects.toThrow(
        /table not found/,
      );
    });
  });

  it("discovers tenant tables by their scoping column", async () => {
    await withIsolatedSchema(admin, async (schema) => {
      await createTenantTable(admin, schema, "locations_like", {
        enableRls: true,
        forceRls: true,
        policy: true,
      });
      await admin.query(
        `CREATE TABLE ${schema}.users_like (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
      );

      const discovered = await findTenantTables(admin, { schemas: [schema] });
      expect(discovered).toEqual([{ schema, table: "locations_like" }]);

      // Full pipeline: discover then assert.
      await expect(assertRlsCoverage(admin, discovered)).resolves.toHaveLength(1);
    });
  });
});
