/**
 * Slotnova architecture-boundary ruleset (task T005, PR-01).
 *
 * These are the CORE rules that must be in force before any module is built
 * (FR-006, SC-005, constitution II/III, `docs/architecture/overview.md`
 * "Architectural quality gates", `docs/standards/ci-quality-gates.md`).
 * They are path-pattern based on the intended monorepo structure
 * (`specs/001-platform-foundation-shell/plan.md` Project Structure) and apply
 * as soon as the matching directories exist.
 *
 * Rule TIGHTENING (per-module public-entry allowlists, generated-only import
 * direction for `packages/contracts`, `apps/web/src/test-harness` never in the
 * production graph) is task T085 (PR-19) — do not add it here.
 *
 * The deliberately-broken fixtures under `__fixtures__/` are excluded from the
 * normal cruise; `__tests__/rules.test.ts` (task T006) cruises each fixture
 * with its own `baseDir` and asserts the expected rule fires.
 */

/** Provider SDKs that domain/application code may never import directly (ADR-004, hard prohibition). */
const PROVIDER_SDKS = [
  "^stripe$",
  "^@stripe/",
  "^twilio$",
  "^@sendgrid/",
  "^postmark",
  "^nodemailer$",
  "^resend$",
  "^@slack/",
  "^@aws-sdk/",
  "^firebase-admin",
  "^@googleapis/",
  "^googleapis$",
  "^plaid$",
  "^@sentry/node$",
].join("|");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "No circular dependencies (constitution VI; overview 'no circular domain dependencies').",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "ui-not-to-infra",
      comment:
        "Frontend (apps/web, packages/ui) must not import database or server-infrastructure code " +
        "(constitution II; overview 'no frontend-to-database access').",
      severity: "error",
      from: { path: "^(apps/web|packages/ui)/" },
      to: {
        path: [
          "^packages/db/",
          "^packages/observability-server/",
          "^apps/api/src/modules/[^/]+/infrastructure/",
          "^apps/worker/",
        ].join("|"),
      },
    },
    {
      name: "domain-not-to-provider-sdk",
      comment:
        "Domain/application layers must not import a provider SDK directly — use an adapter port " +
        "(ADR-004; hard prohibition 'no provider SDK inside domain/UI code').",
      severity: "error",
      from: { path: "/(domain|application)/", pathNot: "/(__tests__|__fixtures__)/" },
      to: { path: PROVIDER_SDKS },
    },
    {
      name: "no-cross-module-internals",
      comment:
        "One backend module must not import another module's repository/schema/infrastructure — " +
        "cross-context access goes through application ports (constitution III; hard prohibition " +
        "'no cross-domain repository/table import').",
      severity: "error",
      from: { path: "^apps/api/src/modules/([^/]+)/" },
      to: {
        path: "^apps/api/src/modules/([^/]+)/(infrastructure|repositories|repository|schema)/",
        pathNot: "^apps/api/src/modules/$1/",
      },
    },
    {
      name: "no-observability-server-in-browser",
      comment:
        "Server-only observability must never enter a browser bundle " +
        "(`docs/standards/ci-quality-gates.md`).",
      severity: "error",
      from: { path: "^(apps/web|packages/ui|packages/observability-browser)/" },
      to: { path: "^packages/observability-server/" },
    },
    {
      name: "no-deep-import-across-packages",
      comment:
        "Import a workspace package through its public entry point, not a deep internal path " +
        "(overview 'no deep imports across bounded contexts'; no barrel/deep-path layers).",
      severity: "error",
      from: { path: "^(apps|packages)/([^/]+)/", pathNot: "/(__tests__|__fixtures__)/" },
      to: {
        path: "^packages/([^/]+)/src/.+",
        pathNot: [
          // its own internals are fine
          "^packages/$2/",
          // the public entry point is fine
          "^packages/[^/]+/src/index\\.(ts|tsx|js|mjs)$",
        ].join("|"),
      },
    },
    {
      name: "not-to-unresolvable",
      comment: "Do not depend on modules that cannot be resolved.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: [
        "(^|/)node_modules/",
        "(^|/)(dist|coverage|\\.turbo|\\.output)/",
        "/__fixtures__/",
      ].join("|"),
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"],
    },
  },
};
