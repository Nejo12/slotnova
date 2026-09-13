import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UserId } from "../domain/ids.js";
import { DevCredentialAdapter } from "../infrastructure/credential-adapter/dev-adapter.js";
import type { CredentialAdapter } from "../infrastructure/credential-adapter/port.js";
import { ProductionShapedCredentialAdapterDouble } from "../infrastructure/credential-adapter/__tests__/production-shaped-adapter.double.js";
import { MembershipsRepository } from "../infrastructure/repositories/memberships.repository.js";
import { SessionsRepository } from "../infrastructure/repositories/sessions.repository.js";
import { UsersRepository } from "../infrastructure/repositories/users.repository.js";
import { SessionContextService } from "../application/session/session-context.service.js";
import { SessionService } from "../application/session/session.service.js";
import { SignInUseCase } from "../application/session/sign-in.use-case.js";

/**
 * T039 -- credential-adapter parity: the SAME session/context/RLS assertions
 * run against the dev adapter and a production-shaped double (FR-033d,
 * SC-016). Proves session/workspace-context behavior is identical regardless
 * of which adapter verified the credential, and that a provider's role
 * claims can never influence Slotnova's own authorization data (FR-027).
 */
describe("credential-adapter parity (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;

  let users: UsersRepository;
  let memberships: MembershipsRepository;
  let sessionService: SessionService;
  let sessionContext: SessionContextService;

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });

    users = new UsersRepository(pool);
    memberships = new MembershipsRepository(pool);
    sessionService = new SessionService(new SessionsRepository(pool));
    sessionContext = new SessionContextService(users, memberships);
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  interface Scenario {
    readonly label: string;
    readonly adapter: CredentialAdapter;
    readonly credential: unknown;
    readonly userEmail: string;
    /** Only asserted for the production-shaped scenario -- proves claims never surface. */
    readonly claimedRoles?: readonly string[];
  }

  async function seedUserAndMembership(email: string, permissions: readonly string[]) {
    const user = await admin.query<{ id: string }>(
      `INSERT INTO public.users (email, display_name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [email, `Parity ${email}`],
    );
    const userId = user.rows[0]!.id;
    const workspace = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Parity WS ${email}`, `parity-ws-${email.replace(/[^a-z0-9]/gi, "-")}`],
    );
    const workspaceId = workspace.rows[0]!.id;
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions) VALUES ($1, $2, 'owner', $3)`,
      [workspaceId, userId, permissions],
    );
    return { userId, workspaceId };
  }

  it("produces identical sign-in, session validation, and workspace-context behavior for both adapters", async () => {
    const dev = await seedUserAndMembership("dev-parity@example.test", ["members:invite"]);
    const devAdapter = new DevCredentialAdapter([
      { email: "dev-parity@example.test", displayName: "Dev Parity" },
    ]);

    const prod = await seedUserAndMembership("prod-parity@example.test", ["members:invite"]);
    const productionAdapter = new ProductionShapedCredentialAdapterDouble(
      new Map([
        [
          "prod-token-abc",
          {
            providerUserId: "provider-user-1",
            email: "prod-parity@example.test",
            displayName: "Prod Parity",
            // A real vendor would send role claims here -- must never leak
            // into Slotnova's own authorization data (FR-027).
            claimedRoles: ["superadmin", "billing:owner"],
          },
        ],
      ]),
    );

    const scenarios: readonly Scenario[] = [
      {
        label: "dev adapter",
        adapter: devAdapter,
        credential: { seededUserEmail: "dev-parity@example.test" },
        userEmail: "dev-parity@example.test",
      },
      {
        label: "production-shaped double",
        adapter: productionAdapter,
        credential: { token: "prod-token-abc" },
        userEmail: "prod-parity@example.test",
        claimedRoles: ["superadmin", "billing:owner"],
      },
    ];

    for (const scenario of scenarios) {
      const signInUseCase = new SignInUseCase(scenario.adapter, users, memberships, sessionService);
      const result = await signInUseCase.execute(scenario.credential);

      expect(result.outcome).toEqual("signed-in");
      if (result.outcome !== "signed-in") throw new Error("unreachable");

      expect(result.user.email).toEqual(scenario.userEmail);
      // Exactly one active membership each -> auto-selected, identically.
      expect(result.activeWorkspace).not.toBeNull();
      expect(result.activeWorkspace?.role).toEqual("owner");
      expect(result.workspaces).toHaveLength(1);

      // The session issued genuinely validates through the real session path
      // (SC-016) -- identical mechanics regardless of adapter.
      const validated = await sessionService.validate(result.rawToken);
      expect(validated?.userId).toEqual(result.user.id);
      expect(validated?.activeWorkspaceId).toEqual(result.activeWorkspace?.id);

      // Workspace-context read (GET /me equivalent) resolves identically,
      // and permissions come ONLY from the membership row in the database --
      // a provider's claimed roles (if any) never appear here.
      const context = await sessionContext.build(validated!);
      expect(context?.activeWorkspace?.permissions).toEqual(["members:invite"]);
      if (scenario.claimedRoles) {
        for (const claimed of scenario.claimedRoles) {
          expect(context?.activeWorkspace?.permissions).not.toContain(claimed);
        }
      }

      await sessionService.revoke(result.rawToken);
      expect(await sessionService.validate(result.rawToken)).toBeNull();
    }

    // No path skips tenant context or RLS: each user's own membership lookup
    // never returns the other's workspace, even though both were seeded in
    // the same run (independent RLS-backed reads, not mocks).
    const devViews = await memberships.listActiveMembershipsForUser(dev.userId as UserId);
    const prodViews = await memberships.listActiveMembershipsForUser(prod.userId as UserId);
    expect(devViews.map((v) => v.workspaceId)).toEqual([dev.workspaceId]);
    expect(prodViews.map((v) => v.workspaceId)).toEqual([prod.workspaceId]);
  });

  it("rejects an unrecognized credential identically (generic outcome, no user-enumeration) for both adapters", async () => {
    const devAdapter = new DevCredentialAdapter([]);
    const productionAdapter = new ProductionShapedCredentialAdapterDouble(new Map());

    for (const adapter of [devAdapter, productionAdapter]) {
      const signInUseCase = new SignInUseCase(adapter, users, memberships, sessionService);
      const result = await signInUseCase.execute({ bogus: true });
      expect(result.outcome).toEqual("invalid-credentials");
    }
  });
});
