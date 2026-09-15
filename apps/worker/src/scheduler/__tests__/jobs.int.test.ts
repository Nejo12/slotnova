import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool, runMigrations } from "@slotnova/db";
import { startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { createIdentityMaintenance } from "@slotnova/api/identity-maintenance";
import { outboxRetention } from "../jobs/outbox-retention.js";
let pg: PostgresHarness;
let pool: Pool;
beforeAll(async () => {
  pg = await startPostgres();
  await runMigrations({ connectionString: pg.adminUri });
  pool = new Pool({ connectionString: pg.adminUri });
});
afterAll(async () => {
  await pool?.end();
  await pg?.stop();
});
it("expires only pending invitations in each RLS workspace, idempotently", async () => {
  const user = (
    await pool.query(
      "INSERT INTO users(email,display_name) VALUES ('worker@example.test','Worker') RETURNING id",
    )
  ).rows[0].id;
  for (const slug of ["one", "two"]) {
    const workspace = (
      await pool.query("INSERT INTO workspaces(name,slug) VALUES($1,$1) RETURNING id", [slug])
    ).rows[0].id;
    const member = (
      await pool.query(
        "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner') RETURNING id",
        [workspace, user],
      )
    ).rows[0].id;
    for (const status of ["pending", "accepted", "revoked", "expired"]) {
      await pool.query(
        `INSERT INTO invitations(workspace_id,email,role,token_hash,expires_at,invited_by,status)
        VALUES($1,$2::text,'staff',$2::text,clock_timestamp()-interval '1 day',$3,$4)`,
        [workspace, `${slug}-${status}@example.test`, member, status],
      );
    }
    await pool.query(
      `INSERT INTO invitations(workspace_id,email,role,token_hash,expires_at,invited_by)
      VALUES($1,$2::text,'staff',$2::text,clock_timestamp()+interval '1 day',$3)`,
      [workspace, `${slug}-active@example.test`, member],
    );
  }
  const maintenance = createIdentityMaintenance(pool);
  await maintenance.expiredInvitations(10);
  await maintenance.expiredInvitations(10);
  const statuses = (
    await pool.query(
      "SELECT status, count(*)::int n FROM invitations GROUP BY status ORDER BY status::text",
    )
  ).rows;
  expect(statuses).toEqual([
    { status: "accepted", n: 2 },
    { status: "expired", n: 4 },
    { status: "pending", n: 2 },
    { status: "revoked", n: 2 },
  ]);
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL ROLE slotnova_app");
    expect((await tx.query("SELECT id FROM invitations")).rowCount).toBe(0);
    await tx.query("ROLLBACK");
  } finally {
    tx.release();
  }
});
it("session pruning preserves active sessions and referenced rotation ancestors", async () => {
  const user = (
    await pool.query(
      "INSERT INTO users(email,display_name) VALUES ('session@example.test','Session') RETURNING id",
    )
  ).rows[0].id;
  const ancestor = (
    await pool.query(
      "INSERT INTO sessions(user_id,expires_at) VALUES($1,clock_timestamp()-interval '60 days') RETURNING id",
      [user],
    )
  ).rows[0].id;
  const active = (
    await pool.query(
      "INSERT INTO sessions(user_id,expires_at,rotated_from) VALUES($1,clock_timestamp()+interval '1 day',$2) RETURNING id",
      [user, ancestor],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO sessions(user_id,expires_at) VALUES($1,clock_timestamp()-interval '60 days')",
    [user],
  );
  const maintenance = createIdentityMaintenance(pool);
  await maintenance.expiredSessions(10, 30);
  await maintenance.expiredSessions(10, 30);
  expect(
    (await pool.query("SELECT id FROM sessions ORDER BY id")).rows.map((row) => row.id),
  ).toEqual([ancestor, active].sort());
});
it("retention only prunes old acknowledged unclaimed records, preserving dead-letter evidence", async () => {
  await pool.query(`INSERT INTO outbox_records(event_name,payload,processed_at,dead_lettered_at,claimed_at,claimed_by)
    VALUES ('old','{}',clock_timestamp()-interval '60 days',NULL,NULL,NULL),
    ('recent','{}',clock_timestamp(),NULL,NULL,NULL),
    ('pending','{}',NULL,NULL,NULL,NULL),
    ('dead','{}',NULL,clock_timestamp()-interval '60 days',NULL,NULL),
    ('claimed','{}',clock_timestamp()-interval '60 days',NULL,clock_timestamp(),'owner'),
    ('retry','{}',NULL,NULL,NULL,NULL)`);
  await pool.query("UPDATE outbox_records SET attempts=2 WHERE event_name='retry'");
  const prune = outboxRetention(pool, 10, 30);
  await prune();
  await prune();
  expect(
    (await pool.query("SELECT event_name FROM outbox_records ORDER BY event_name")).rows.map(
      (row) => row.event_name,
    ),
  ).toEqual(["claimed", "dead", "pending", "recent", "retry"]);
});
