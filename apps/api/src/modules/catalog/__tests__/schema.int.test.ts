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
import { ServiceCategoriesRepository } from "../infrastructure/repositories/service-categories.repository.js";
import {
  ServiceCategoryNotInWorkspaceError,
  ServicesRepository,
} from "../infrastructure/repositories/services.repository.js";

/**
 * Issue #58 (Phase 2 PR-01) — Catalog schema + migration + RLS tests (real
 * PostgreSQL). Proves `packages/db/migrations/0006_catalog.sql` against a
 * real server: clean/forward apply, RLS coverage/isolation for `services`
 * and `service_categories`, the cross-workspace category-association
 * safety net, and the repository create/update/deactivate paths.
 */
describe("catalog migration (real PostgreSQL)", () => {
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
    expect(result.appliedVersions).toEqual(expect.arrayContaining(["0006"]));
  });

  it("applies forward onto a populated prior state without data loss", async () => {
    await assertForwardMigration({
      adminUri: harness.adminUri,
      migrationsDir: DEFAULT_MIGRATIONS_DIR,
      stopBefore: "0006",
      seed: async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.outbox_records (event_name, payload)
           VALUES ('platform.pre_catalog_marker', '{"requestId":"req-forward-catalog-1"}'::jsonb)
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

  it("has RLS enabled + forced + policy on services and service_categories", async () => {
    await runMigrations({ connectionString: harness.adminUri });
    const admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    try {
      await expect(
        assertRlsCoverage(admin, [
          { schema: "public", table: "services" },
          { schema: "public", table: "service_categories" },
        ]),
      ).resolves.toHaveLength(2);
    } finally {
      await admin.end();
    }
  });
});

describe("catalog tenant isolation & repository behavior (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let servicesRepo: ServicesRepository;
  let categoriesRepo: ServiceCategoriesRepository;
  let workspaceAId: string;
  let workspaceBId: string;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    const a = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace A', 'catalog-ws-a')
       RETURNING id`,
    );
    workspaceAId = a.rows[0]!.id;
    const b = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace B', 'catalog-ws-b')
       RETURNING id`,
    );
    workspaceBId = b.rows[0]!.id;

    pool = new Pool({ connectionString: harness.appUri });
    servicesRepo = new ServicesRepository();
    categoriesRepo = new ServiceCategoriesRepository();
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("creates a service via the repository under workspace context", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: null,
        name: "Signature Facial",
        durationMinutes: 45,
        preBufferMinutes: 5,
        postBufferMinutes: 10,
        price: { amountMinor: 12000, currency: "USD" },
      }),
    );

    expect(created.name).toBe("Signature Facial");
    expect(created.active).toBe(true);
    expect(created.durationMinutes).toBe(45);
    expect(created.price).toEqual({ amountMinor: 12000, currency: "USD" });
  });

  it("updates allowed fields and preserves the rest", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: null,
        name: "Haircut",
        durationMinutes: 30,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        price: { amountMinor: 4000, currency: "GBP" },
      }),
    );

    const updated = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.update(tx, created.id, { durationMinutes: 40 }),
    );

    expect(updated.durationMinutes).toBe(40);
    expect(updated.name).toBe("Haircut");
    expect(updated.price).toEqual({ amountMinor: 4000, currency: "GBP" });
  });

  it("deactivates a service without deleting the row", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: null,
        name: "Manicure",
        durationMinutes: 20,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        price: { amountMinor: 2500, currency: "USD" },
      }),
    );

    const deactivated = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.deactivate(tx, created.id),
    );
    expect(deactivated.active).toBe(false);

    const stillThere = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.findById(tx, created.id),
    );
    expect(stillThere).not.toBeNull();
    expect(stillThere!.active).toBe(false);
  });

  it("keeps workspace A's service invisible from workspace B", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: null,
        name: "Workspace A Only Service",
        durationMinutes: 15,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        price: { amountMinor: 1000, currency: "USD" },
      }),
    );

    const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
      servicesRepo.findById(tx, created.id),
    );
    expect(fromB).toBeNull();
  });

  it("rejects a cross-workspace insert attempt (RLS WITH CHECK)", async () => {
    await expect(
      withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        servicesRepo.create(tx, {
          // Row claims to belong to workspace B while the transaction's RLS
          // context is workspace A -- WITH CHECK must reject this.
          workspaceId: asWorkspaceId(workspaceBId),
          categoryId: null,
          name: "Should never be written",
          durationMinutes: 10,
          preBufferMinutes: 0,
          postBufferMinutes: 0,
          price: { amountMinor: 100, currency: "USD" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a cross-workspace update attempt", async () => {
    const created = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: null,
        name: "Target Of Cross-Workspace Update",
        durationMinutes: 15,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        price: { amountMinor: 500, currency: "USD" },
      }),
    );

    // Workspace B's context sees zero rows for this id (RLS), so the UPDATE
    // affects no row and the repository must surface that as a failure
    // rather than silently succeeding.
    await expect(
      withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
        servicesRepo.update(tx, created.id, { name: "Hijacked" }),
      ),
    ).rejects.toThrow();

    const stillOriginal = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.findById(tx, created.id),
    );
    expect(stillOriginal!.name).toBe("Target Of Cross-Workspace Update");
  });

  it("fails closed: a query with no workspace context sees no service rows", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT id FROM public.services");
      expect(rows).toHaveLength(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("creates a service category and associates a service to it in the same workspace", async () => {
    const category = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      categoriesRepo.create(tx, { workspaceId: asWorkspaceId(workspaceAId), name: "Hair" }),
    );

    const service = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      servicesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        categoryId: category.id,
        name: "Blowout",
        durationMinutes: 30,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
        price: { amountMinor: 3500, currency: "USD" },
      }),
    );

    expect(service.categoryId).toBe(category.id);
  });

  it("rejects a service categoryId that belongs to a different workspace, at the database level", async () => {
    const categoryInB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
      categoriesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceBId),
        name: "Workspace B Category",
      }),
    );

    // The composite FK (services_category_workspace_fkey) requires
    // (workspace_id, category_id) to match a row in service_categories --
    // workspace A + workspace B's category id cannot satisfy that pair.
    await expect(
      withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
        servicesRepo.create(tx, {
          workspaceId: asWorkspaceId(workspaceAId),
          categoryId: categoryInB.id,
          name: "Should be rejected",
          durationMinutes: 10,
          preBufferMinutes: 0,
          postBufferMinutes: 0,
          price: { amountMinor: 100, currency: "USD" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("application-layer resolution also rejects a cross-workspace category (defense in depth)", async () => {
    const categoryInB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
      categoriesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceBId),
        name: "Another Workspace B Category",
      }),
    );

    await withWorkspaceContext(pool, { workspaceId: workspaceAId }, async (tx) => {
      const resolved = await categoriesRepo.findById(tx, categoryInB.id);
      expect(() => servicesRepo.assertCategoryResolved(categoryInB.id, resolved)).toThrow(
        ServiceCategoryNotInWorkspaceError,
      );
    });
  });

  it("keeps workspace A and workspace B service_categories mutually invisible", async () => {
    const categoryA = await withWorkspaceContext(pool, { workspaceId: workspaceAId }, (tx) =>
      categoriesRepo.create(tx, {
        workspaceId: asWorkspaceId(workspaceAId),
        name: "A-only category",
      }),
    );

    const fromB = await withWorkspaceContext(pool, { workspaceId: workspaceBId }, (tx) =>
      categoriesRepo.findById(tx, categoryA.id),
    );
    expect(fromB).toBeNull();
  });
});
