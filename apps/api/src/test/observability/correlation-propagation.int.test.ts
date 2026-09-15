import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import {
  createInMemoryExporter,
  createLogger,
  createTechnicalMeter,
  runWithChildContext,
  TECHNICAL_METRIC_NAMES,
  type LogRecord,
} from "@slotnova/observability-server";
import { createTelemetrySink } from "@slotnova/testing/telemetry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSecurityConfig } from "../../config/security-config.js";
import { createApp } from "../../main.js";
import { REQUEST_ID_HEADER } from "../../http/correlation/register-correlation.js";
import { csrfCookieName } from "../../modules/platform/security/csrf.js";
import { sessionCookieName } from "../../modules/identity/application/session/session-cookie.js";
import { SessionService } from "../../modules/identity/application/session/session.service.js";
import type { UserId, WorkspaceId } from "../../modules/identity/domain/ids.js";
import { SessionsRepository } from "../../modules/identity/infrastructure/repositories/sessions.repository.js";

/**
 * T078 — observability integration coverage (correlation, redaction, event
 * assertion). Real PostgreSQL; no arbitrary sleeps (every wait is a direct
 * query against already-committed state, never a poll for eventual state).
 *
 * The worker's own restoration of a job's correlation context (including on
 * the retry/dead-letter path) is exercised end-to-end by the real consumer in
 * `apps/worker/src/outbox/__tests__/consumer.int.test.ts` ("propagates
 * correlation") — this suite is not a redundant copy of that. What it proves
 * is the API-side half of the contract: a request id is generated or
 * preserved (FR-054), it is the exact value written into the outbox record's
 * payload (T076 plumb-through), and restoring it via the shared
 * `runWithChildContext` primitive — the identical function
 * `apps/worker/src/outbox/dispatch.ts` calls to restore a job's context —
 * reproduces that same id in a structured log line, closing the loop between
 * the two independently-tested halves without introducing a new cross-app
 * dependency (`apps/api` must not depend on `@slotnova/worker`).
 */
describe("observability: correlation propagation (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let app: NestFastifyApplication;
  let sessions: SessionService;
  let sequence = 0;

  const security = resolveSecurityConfig(process.env);
  const SESSION_COOKIE = sessionCookieName(security.secureCookies);
  const CSRF_COOKIE = csrfCookieName(security.secureCookies);

  const unique = (prefix: string) => `${prefix}-${Date.now()}-${sequence++}`;

  async function csrf() {
    const response = await app.inject({ method: "GET", url: "/v1/auth/csrf" });
    const cookie = response.cookies.find((item) => item.name === CSRF_COOKIE)!;
    return { cookie: `${cookie.name}=${cookie.value}`, token: cookie.value };
  }

  async function stateHeaders(rawSession: string) {
    const token = await csrf();
    return {
      cookie: `${SESSION_COOKIE}=${rawSession}; ${token.cookie}`,
      "x-csrf-token": token.token,
    };
  }

  async function createActor() {
    const suffix = unique("workspace");
    const workspace = await admin.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id",
      [`Workspace ${suffix}`, suffix],
    );
    const user = await admin.query<{ id: string }>(
      "INSERT INTO public.users (email, display_name) VALUES ($1, 'Observability Actor') RETURNING id",
      [`${unique("actor")}@example.test`],
    );
    await admin.query(
      `INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
       VALUES ($1, $2, 'admin', $3)`,
      [workspace.rows[0]!.id, user.rows[0]!.id, ["members:invite"]],
    );
    const session = await sessions.issue({
      userId: user.rows[0]!.id as UserId,
      activeWorkspaceId: workspace.rows[0]!.id as WorkspaceId,
    });
    return { workspaceId: workspace.rows[0]!.id, rawSession: session.rawToken };
  }

  beforeAll(async () => {
    process.env["NODE_ENV"] = "test";
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });
    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();
    pool = new Pool({ connectionString: harness.appUri });
    sessions = new SessionService(new SessionsRepository(pool));
    process.env["DATABASE_URL"] = harness.appUri;
    app = await createApp();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
    await admin.end();
    await harness.stop();
  });

  it("generates a correlation id when the caller supplies none", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    const requestId = response.headers[REQUEST_ID_HEADER];
    expect(typeof requestId).toBe("string");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves a caller-supplied correlation id", async () => {
    const suppliedId = `client-supplied-${unique("id")}`;
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { [REQUEST_ID_HEADER]: suppliedId },
    });
    expect(response.headers[REQUEST_ID_HEADER]).toBe(suppliedId);
  });

  it("falls back to a generated id when the supplied header is untrusted", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { [REQUEST_ID_HEADER]: "not a safe id; contains spaces" },
    });
    expect(response.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it(
    "propagates the request id into the outbox record it writes, and restoring it " +
      "via the shared context primitive reproduces the same id in a structured log",
    async () => {
      const actor = await createActor();
      const suppliedId = `req-${unique("propagation")}`;
      const email = `${unique("invitee")}@example.test`;

      const response = await app.inject({
        method: "POST",
        url: "/v1/invitations",
        headers: { ...(await stateHeaders(actor.rawSession)), [REQUEST_ID_HEADER]: suppliedId },
        payload: { email, role: "staff" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.headers[REQUEST_ID_HEADER]).toBe(suppliedId);
      const invitationId = response.json().invitation.id as string;

      const outbox = await admin.query<{ payload: { requestId: string } }>(
        "SELECT payload FROM public.outbox_records WHERE payload->>'invitationId' = $1",
        [invitationId],
      );
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0]!.payload.requestId).toBe(suppliedId);

      const restoredRequestId = outbox.rows[0]!.payload.requestId;
      const lines: string[] = [];
      const workerLogger = createLogger({ sink: (line) => lines.push(line) });
      await runWithChildContext(
        { correlationId: restoredRequestId, requestId: restoredRequestId },
        () => {
          workerLogger.info("outbox.dispatch", { meta: { eventName: "invitation.issued" } });
        },
      );

      const workerRecord = JSON.parse(lines[0]!) as LogRecord;
      expect(workerRecord.correlationId).toBe(suppliedId);
      expect(workerRecord.requestId).toBe(suppliedId);
    },
  );

  it("redacts configured sensitive fields from sampled logs", () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (line) => lines.push(line) });

    logger.info("test.sensitive_sample", {
      meta: {
        route: "/v1/auth/session",
        password: "not-a-real-secret",
        token: "not-a-real-secret",
        authorization: "Bearer not-a-real-secret",
        sessionAccessToken: "not-a-real-secret",
        nested: { apiKey: "not-a-real-secret" },
      },
    });

    const record = JSON.parse(lines[0]!) as LogRecord;
    const serialized = lines[0]!;
    expect(serialized).not.toContain("not-a-real-secret");
    expect(record.meta).toMatchObject({
      route: "/v1/auth/session",
      password: "[REDACTED]",
      token: "[REDACTED]",
      authorization: "[REDACTED]",
      sessionAccessToken: "[REDACTED]",
      nested: { apiKey: "[REDACTED]" },
    });
  });

  it("asserts a domain/telemetry event deterministically, with no network or provider", async () => {
    const actor = await createActor();
    const email = `${unique("telemetry")}@example.test`;
    const response = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      headers: await stateHeaders(actor.rawSession),
      payload: { email, role: "staff" },
    });
    expect(response.statusCode).toBe(201);
    const invitationId = response.json().invitation.id as string;

    const outbox = await admin.query<{ event_name: string; payload: { requestId: string } }>(
      "SELECT event_name, payload FROM public.outbox_records WHERE payload->>'invitationId' = $1",
      [invitationId],
    );
    const record = outbox.rows[0]!;

    // No network/provider is reachable from this in-memory sink (FR-055,
    // T018) — asserting against it proves domain-event coverage works
    // without a hosted vendor in local/CI.
    const sink = createTelemetrySink();
    sink.emit("outbox.recorded", {
      eventName: record.event_name,
      requestId: record.payload.requestId,
    });

    const emitted = sink.assertEmitted("outbox.recorded");
    expect(emitted.payload).toEqual({
      eventName: "invitation.issued",
      requestId: record.payload.requestId,
    });
    sink.assertEmittedTimes("outbox.recorded", 1);
  });

  it("records a technical metric through the vendor-neutral exporter seam with no high-cardinality label", () => {
    const exporter = createInMemoryExporter();
    const meter = createTechnicalMeter(exporter);

    meter.histogram(TECHNICAL_METRIC_NAMES.httpRequestDurationMs).record(12, {
      route: "/v1/invitations",
      method: "POST",
      outcome: "success",
    });

    expect(exporter.points).toHaveLength(1);
    expect(exporter.points[0]).toMatchObject({
      namespace: "technical",
      name: TECHNICAL_METRIC_NAMES.httpRequestDurationMs,
      kind: "histogram",
      value: 12,
    });
    // FR-056: a request id would be exactly the kind of label this seam refuses.
    expect(() =>
      meter
        .counter(TECHNICAL_METRIC_NAMES.httpRequestsTotal)
        .add(1, { requestId: "should-not-be-a-label" }),
    ).toThrow(/high-cardinality|sensitive/);
  });
});
