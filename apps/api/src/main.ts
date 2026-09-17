import "reflect-metadata";
import { assertRuntimeDatabaseRole, type Pool } from "@slotnova/db";
import { DB_POOL } from "./modules/platform/database/database.tokens.js";

import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { resolveApiConfig } from "./config/environment-config.js";
import {
  REQUEST_ID_HEADER,
  registerCorrelationHook,
} from "./http/correlation/register-correlation.js";
import { registerRateLimits } from "./modules/platform/security/rate-limits.js";
import { CSRF_HEADER_NAME, registerCsrfProtection } from "./modules/platform/security/csrf.js";

/**
 * Build (but do not start listening on) the Nest + Fastify app. Split from
 * {@link bootstrap} deliberately (T019 "bootstrap must be testable without
 * binding a fixed production port") — tests call this and exercise the app
 * via Fastify's `inject()` or `app.listen(0, ...)`, never a hard-coded port.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const config = resolveApiConfig(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: config.trustProxy.length ? config.trustProxy : false }),
    {
      bufferLogs: true,
    },
  );

  const security = config.security;
  const instance = app.getHttpAdapter().getInstance();

  // Correlation must be the very first thing that runs for a request so every
  // downstream hook/guard/interceptor/handler executes inside its ALS context.
  registerCorrelationHook(instance);

  // Needed before CSRF verification: it reads/writes cookies via
  // `request.cookies`/`reply.setCookie` (T037).
  await app.register(fastifyCookie);

  // Centralized CSRF enforcement (ADR-007, research R6) — registered once
  // here rather than per-route, so no state-changing route can ever be added
  // without it. Runs after correlation (rejections carry the request id) and
  // after the cookie plugin (needs `request.cookies`).
  registerCsrfProtection(instance, {
    allowedOrigins: security.corsOrigins,
    secureCookies: security.secureCookies,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      // No product UI is served by this API; deny everything by default.
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    hsts: security.enableHsts ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });

  registerRateLimits(instance, {
    authMax: config.API_RATE_LIMIT_AUTH_MAX,
    previewMax: config.API_RATE_LIMIT_PREVIEW_MAX,
    windowMs: config.API_RATE_LIMIT_WINDOW_MS,
    maxKeys: config.API_RATE_LIMIT_MAX_KEYS,
  });

  // Strict, explicit allowlist — no permissive "*". `credentials: true` is
  // required for the SPA's session cookie to flow on cross-origin requests
  // (T037/T038); safe only alongside a non-wildcard, explicit allowlist,
  // which `security.corsOrigins` already guarantees (never "*").
  app.enableCors({
    origin: security.corsOrigins.length > 0 ? [...security.corsOrigins] : false,
    credentials: security.corsOrigins.length > 0,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    // `Idempotency-Key` is required by `POST /v1/catalog/services` (PR-02);
    // without it on this allowlist a browser's preflight would reject the
    // SPA's own retry-safe create before it ever reached the API.
    allowedHeaders: ["Content-Type", CSRF_HEADER_NAME, REQUEST_ID_HEADER, "Idempotency-Key"],
  });

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const { API_PORT: port, API_HOST: host } = resolveApiConfig(process.env);
  app.enableShutdownHooks();
  const client = await app.get<Pool>(DB_POOL).connect();
  try {
    await assertRuntimeDatabaseRole(client);
  } finally {
    client.release();
  }
  await app.listen(port, host);
}

const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted) {
  bootstrap().catch((error: unknown) => {
    // eslint-disable-next-line no-console -- last-resort sink before the app exists to log through
    console.error(error);
    process.exit(1);
  });
}
