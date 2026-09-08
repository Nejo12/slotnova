import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "pg";

import { assertNonBypassRlsRole } from "../../client.js";
import {
  DEFAULT_POSTGRES_IMAGE,
  openIndependentConnections,
  startPostgres,
  type PostgresHarness,
} from "../pg-container.js";
import { withRolledBackTransaction } from "../transactions.js";

let harness: PostgresHarness;

beforeAll(async () => {
  harness = await startPostgres();
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

describe("real PostgreSQL Testcontainers harness (T011)", () => {
  it("starts a real container and runs a trivial query", async () => {
    const client = new Client({ connectionString: harness.appUri });
    await client.connect();
    try {
      const { rows } = await client.query<{ one: number }>("SELECT 1::int AS one");
      expect(rows[0]?.one).toBe(1);
      const version = await client.query<{ server_version: string }>("SHOW server_version");
      expect(version.rows[0]?.server_version).toMatch(/^18[.\s]/);
    } finally {
      await client.end();
    }
  });

  it("reports the pinned image", () => {
    expect(DEFAULT_POSTGRES_IMAGE).toBe("postgres:18-alpine");
  });

  it("can install the btree_gist extension", async () => {
    const client = new Client({ connectionString: harness.adminUri });
    await client.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
      const { rows } = await client.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'btree_gist'",
      );
      expect(rows[0]?.extname).toBe("btree_gist");
    } finally {
      await client.end();
    }
  });

  it("provisions an RLS-subject application role that is not superuser and not BYPASSRLS", async () => {
    const app = new Client({ connectionString: harness.appUri });
    await app.connect();
    try {
      await expect(assertNonBypassRlsRole(app)).resolves.toBeUndefined();
      const { rows } = await app.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      );
      expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    } finally {
      await app.end();
    }
  });

  it("flags a privileged role as unsuitable for RLS-subject traffic", async () => {
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(assertNonBypassRlsRole(admin)).rejects.toThrow(/row-level security/);
    } finally {
      await admin.end();
    }
  });

  it("opens genuinely independent connections for concurrency tests", async () => {
    const clients = await openIndependentConnections(harness.appUri, 3);
    try {
      const pids = await Promise.all(
        clients.map(async (client) => {
          const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
          return rows[0]?.pid;
        }),
      );
      expect(new Set(pids).size).toBe(3);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  it("rolls back everything written inside withRolledBackTransaction", async () => {
    const setup = new Client({ connectionString: harness.adminUri });
    await setup.connect();
    try {
      await setup.query("CREATE TABLE IF NOT EXISTS rollback_probe (id int PRIMARY KEY)");
      await setup.query("TRUNCATE rollback_probe");

      await withRolledBackTransaction(harness.adminUri, async (tx) => {
        await tx.query("INSERT INTO rollback_probe (id) VALUES (1), (2)");
        const inside = await tx.query<{ count: string }>(
          "SELECT count(*) AS count FROM rollback_probe",
        );
        expect(Number(inside.rows[0]?.count)).toBe(2);
      });

      const after = await setup.query<{ count: string }>(
        "SELECT count(*) AS count FROM rollback_probe",
      );
      expect(Number(after.rows[0]?.count)).toBe(0);
    } finally {
      await setup.query("DROP TABLE IF EXISTS rollback_probe");
      await setup.end();
    }
  });
});
