import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CreateServiceCategoryUseCase } from "../application/create-service-category.use-case.js";
import { CreateServiceUseCase } from "../application/create-service.use-case.js";
import { DeactivateServiceUseCase } from "../application/deactivate-service.use-case.js";
import { UpdateServiceUseCase } from "../application/update-service.use-case.js";
import { InvalidServiceDurationError } from "../domain/service.js";
import { ServiceCategoriesRepository } from "../infrastructure/repositories/service-categories.repository.js";
import { ServicesRepository } from "../infrastructure/repositories/services.repository.js";

/**
 * Application-layer wiring proof (issue #58): domain validation runs before
 * any query is issued, and the category cross-workspace guard is enforced
 * through the use-case path, not only when the repository is called
 * directly (`schema.int.test.ts`).
 */
describe("catalog use-cases (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let workspaceId: string;
  let otherWorkspaceId: string;

  let createService: CreateServiceUseCase;
  let updateService: UpdateServiceUseCase;
  let deactivateService: DeactivateServiceUseCase;
  let createCategory: CreateServiceCategoryUseCase;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    const ws = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Use Case Workspace', 'catalog-uc-ws')
       RETURNING id`,
    );
    workspaceId = ws.rows[0]!.id;
    const otherWs = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Other Workspace', 'catalog-uc-other-ws')
       RETURNING id`,
    );
    otherWorkspaceId = otherWs.rows[0]!.id;

    pool = new Pool({ connectionString: harness.appUri });
    const servicesRepo = new ServicesRepository();
    const categoriesRepo = new ServiceCategoriesRepository();

    createService = new CreateServiceUseCase(pool, servicesRepo, categoriesRepo);
    updateService = new UpdateServiceUseCase(pool, servicesRepo, categoriesRepo);
    deactivateService = new DeactivateServiceUseCase(pool, servicesRepo);
    createCategory = new CreateServiceCategoryUseCase(pool, categoriesRepo);
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("creates, updates and deactivates a service end-to-end", async () => {
    const context = { workspaceId };

    const created = await createService.execute(context, {
      name: "Sports Massage",
      durationMinutes: 50,
      preBufferMinutes: 5,
      postBufferMinutes: 5,
      price: { amountMinor: 9000, currency: "USD" },
    });
    expect(created.active).toBe(true);

    const updated = await updateService.execute(context, created.id, { durationMinutes: 60 });
    expect(updated.durationMinutes).toBe(60);

    const deactivated = await deactivateService.execute(context, created.id);
    expect(deactivated.active).toBe(false);
  });

  it("rejects an invalid create input before any query is issued", async () => {
    await expect(
      createService.execute(
        { workspaceId },
        {
          name: "Invalid",
          durationMinutes: 0,
          price: { amountMinor: 100, currency: "USD" },
        },
      ),
    ).rejects.toThrow(InvalidServiceDurationError);
  });

  it("associates a service with a category created in the same workspace", async () => {
    const category = await createCategory.execute({ workspaceId }, { name: "Massage" });
    const service = await createService.execute(
      { workspaceId },
      {
        name: "Hot Stone Massage",
        categoryId: category.id,
        durationMinutes: 75,
        price: { amountMinor: 11000, currency: "USD" },
      },
    );
    expect(service.categoryId).toBe(category.id);
  });

  it("rejects creating a service against another workspace's category", async () => {
    const foreignCategory = await createCategory.execute(
      { workspaceId: otherWorkspaceId },
      { name: "Foreign Category" },
    );

    await expect(
      createService.execute(
        { workspaceId },
        {
          categoryId: foreignCategory.id,
          name: "Should be rejected",
          durationMinutes: 30,
          price: { amountMinor: 1000, currency: "USD" },
        },
      ),
    ).rejects.toThrow();
  });
});
