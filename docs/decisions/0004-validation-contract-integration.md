# 0004 — Runtime-Validation → OpenAPI Integration (R4)

Status: **PROPOSED** — not Founder-approved. This is the output of the T064 prerequisite compatibility spike (PR-15 Stage A, issue #44). It records evidence for a decision; it is not itself authorization to implement T064–T067.

## Context

ADR-013 requires: HTTP request/response schemas defined once as Zod-compatible runtime schemas at API module boundaries, generating OpenAPI, which in turn generates a typed client/types/MSW handlers into `packages/contracts` — with no duplicated `@ApiProperty`/decorator schema declarations. ADR-013 explicitly deferred the concrete Nest/Zod/OpenAPI integration to a bounded Phase 1 spike (R4), naming `nestjs-zod`, a minimal custom Zod/Nest adapter, and "any current maintained Nest/OpenAPI integration" as the candidate set.

Current Slotnova state at spike time (main `f590396b3ba4f9197fdd3ca85a2a9bd446f457fc`):

- `@nestjs/common` / `@nestjs/core` / `@nestjs/platform-fastify`: **12.0.1**
- `fastify`: **5.12.1**
- `typescript`: **~6.0.3**
- No runtime-schema library is installed yet. `apps/api/src/modules/identity/http/*.schema.ts` are hand-rolled `parse*RequestBody(body: unknown)` functions with manual `typeof`/regex checks, written with an explicit code comment that R4 is undecided until T064 (confirmed by reading `session.schema.ts` and `workspace-context.schema.ts` directly).
- `apps/web` (React 19.3.0, TanStack Query 5.102.8) has no generated-client dependency yet; `packages/testing`'s MSW helpers (`msw@2.15.0`) are already written to compose handlers from a future `@slotnova/contracts/msw` export (T065), confirmed by reading `packages/testing/src/msw/handlers.ts`.
- The existing `ProblemException`/`ProblemExceptionFilter` (`apps/api/src/http/problem/`) already implements the full RFC 9457 `problem+json` shape (`contracts/problem+json.contract.md`) and must be preserved, not replaced.

## Candidates evaluated

### 1. `nestjs-zod` + Zod's native OpenAPI generation (recommended)

| Package | Version pinned in spike | Published | Notes |
|---|---|---|---|
| `zod` | `4.6.5` | 2026-09-13 | Matches the version already resolved in the workspace lockfile (`packages/design-tokens`'s toolchain etc. do not depend on it directly; this is the npm-registry `latest` at spike time) |
| `nestjs-zod` | `5.5.0` | 2026-07-25 | Actively maintained (regular releases through 2026; a `5.0.0-beta.*` channel shows ongoing Zod-4 migration work landed and stabilized) |
| `@nestjs/swagger` | `12.0.1` | matches Nest 12 line | Already NestJS-12-compatible per its own peer range (`^12.0.0`) |
| `openapi-typescript` | `7.13.0` | 2026-02-11 | Client/types generator |
| `openapi-fetch` | `0.17.0` | 2026-02-11 | Typed fetch client, same author/ecosystem as `openapi-typescript` |
| `openapi-msw` | `2.0.0` | 2025-08-14 | Typed MSW handler generator; peer `msw: "^2.10.5"`, satisfied by the repo's pinned `msw@2.15.0` |

### 2. `zod-openapi` / `@asteasolutions/zod-to-openapi` + hand-rolled Nest wiring

Both are maintained (`zod-openapi@6.0.2`, 2026-08-31; `@asteasolutions/zod-to-openapi@9.1.0`, 2026-07-19) and Zod-4-compatible, but neither ships a NestJS integration (validation pipe, DTO class, exception type). Adopting either would mean hand-building the Nest-specific plumbing `nestjs-zod` already provides. Rejected — no maintenance/evidence gap, but strictly more work for the same outcome, and Zod 4's own native `z.toJSONSchema()` (proven below) already makes their core OpenAPI-conversion value proposition redundant for this stack.

### 3. Zod's native `z.toJSONSchema()` alone, no Nest library

Zod 4 ships `z.toJSONSchema(schema, { target: "openapi-3.0" })` natively (proven below) — no third-party OpenAPI-conversion package is required at all for the schema→document step. This is not a competing candidate to (1); it is the mechanism `nestjs-zod@5.5.0` itself now delegates to internally (its own `zodV3ToOpenAPI` helper is marked `@deprecated` in favor of Zod 4's built-in support, confirmed by reading `nestjs-zod`'s shipped `.d.mts`). Using Zod's native conversion without any Nest-specific plumbing would still leave the validation-pipe and Swagger-introspection wiring to hand-build — same rejection reasoning as candidate 2.

### 4. Minimal custom Zod/Nest adapter (ADR-013's second named candidate)

Rejected for now: candidate 1 already satisfies every proof requirement with a maintained package; a custom adapter would only be justified if `nestjs-zod`'s runtime behavior had failed the spike (it did not) or its maintenance signal were weak (it is not — see below).

## Compatibility evidence (empirical, not metadata-only)

`nestjs-zod@5.5.0`'s published `peerDependencies` are `{"@nestjs/common": "^10.0.0 || ^11.0.0", "@nestjs/swagger": "^7.4.2 || ^8.0.0 || ^11.0.0", "zod": "^3.25.0 || ^4.0.0"}` — **stale**, missing NestJS 12. This was verified empirically rather than assumed correct or rejected on the range alone:

- `npm install` (strict resolver) refuses the combination outright without `--legacy-peer-deps`.
- `pnpm add` (Slotnova's actual package manager) installs successfully with only a `WARN` (`pnpm peers check` lists exactly the two stale ranges above) — no install failure, no workaround flag needed in the real monorepo.
- A live NestJS 12.0.1 + Fastify 5.12.1 + Zod 4.6.5 + `nestjs-zod` 5.5.0 app was built and exercised at runtime (isolated spike, not the real `apps/api`):
  - `ZodValidationPipe` bound explicitly per-route (`@UsePipes(new ZodValidationPipe(Dto))`) correctly validated a request and rejected an invalid one with a structured Zod error. **Note**: binding the pipe globally via parameter-type reflection alone did not reliably trigger validation in this spike — the real implementation should bind per-route or verify global-pipe reflection separately before relying on it.
  - `SwaggerModule.createDocument()` (from `@nestjs/swagger@12.0.1`, itself independently NestJS-12-compatible per its own accurate peer range) successfully introspected `nestjs-zod`-created DTO classes and produced a complete OpenAPI document.
  - `nestjs-zod`'s `cleanupOpenApiDoc()` post-processor ran without error against that document.

**Conclusion**: the peer-range mismatch is a maintenance lag in `nestjs-zod`'s `package.json`, not a real incompatibility. This is a known, documented risk (see Risks).

## No-duplication proof

A single `z.object({...})` schema was used simultaneously as: the runtime validator (via `ZodValidationPipe`), the OpenAPI request/response schema source (via `createZodDto` + `@ApiBody`/`@ZodResponse` — decorators that *reference* the schema-derived class, they do not re-declare its fields), and the downstream type-generation source. No `@ApiProperty()` or `class-validator` decorator appears anywhere in the spike.

Two decorator-application patterns are required per endpoint, confirmed by direct testing (not assumed):

- `@ApiBody({ type: SomeZodDto })` — request body; without it, `SwaggerModule` omits `requestBody` from the document entirely (proven: it was missing until this decorator was added).
- `@ApiParam({ name, type })` — path parameters; without it, `SwaggerModule` emits an empty `parameters: []` for a `@Param()`-typed route (proven the same way).
- `@ZodResponse({ status, type })` — response; **must include an explicit `status`** or the document emits a `default` response key instead of a real HTTP status code, which breaks `openapi-fetch`'s generated client typing (proven: `data` resolved to `never` until `status: 200` was added explicitly).

These are all single-line references to the already-Zod-backed DTO class — never a second schema declaration.

## Deterministic-generation proof

Ran `SwaggerModule.createDocument()` end-to-end against **three independent NestJS application instances** (not repeated calls in one process) built from a 4-endpoint spike controller (`GET /v1/me`, `POST /v1/auth/session/workspace`, `GET /v1/invitations/:token`, `POST /v1/invitations/:token/acceptance` — modeled directly on Slotnova's real Phase 1 endpoint set) and confirmed the serialized JSON output was **byte-identical** across all three. Also confirmed `z.toJSONSchema()` alone (no Nest) produces byte-identical output across repeated calls on the same schema.

## `problem+json` support proof

A custom `@Catch(ZodValidationException) ExceptionFilter` was written that maps `nestjs-zod`'s validation exception (via its public `getZodError().issues` API) into Slotnova's exact existing `problem+json` shape — `type`/`title`/`status`/`detail`/`instance`/`errors[]` with `path`/`message` per entry, `Content-Type: application/problem+json`. This is a filter *addition* alongside the existing `ProblemException`/`ProblemExceptionFilter`, not a replacement: the real T064 implementation should have the filter construct a `ProblemException` (or throw one directly from a custom exception factory passed to `ZodValidationPipe`'s `createValidationException` option) so the *existing* filter remains the single problem+json emission path, rather than adding a second parallel filter as the spike did for isolation. This is noted as an implementation detail for T064, not a blocker.

## Generated client/types/MSW feasibility proof

From the deterministic OpenAPI document above:

- `openapi-typescript` generated a correct `paths`/`components` TypeScript file, including the `problem+json` DTO shape (registered via `SwaggerModule.createDocument(app, config, { extraModels: [ProblemJsonDto] })`).
- `openapi-fetch`'s `createClient<paths>()` compiled and type-checked against the generated file with **zero imports from the spike's `apps/api`-equivalent module** — only the generated `.d.ts`.
- `openapi-msw`'s `createOpenApiHttp<paths>()` produced a type-checked, runnable MSW handler against the same generated types, again with no backend imports.

This directly satisfies "browser code will not need to import apps/api internals" — proven, not assumed, since the client/handler files in the spike had no import path back to the Nest module at all.

## Selected recommendation

`nestjs-zod@5.5.0` + `zod@4.6.5` (native `z.toJSONSchema`) + `@nestjs/swagger@12.0.1` (document assembly + Swagger DTO introspection) + `openapi-typescript@7.13.0` + `openapi-fetch@0.17.0` + `openapi-msw@2.0.0`.

## Rejected alternatives and reasons

- **`zod-openapi` / `@asteasolutions/zod-to-openapi` + hand-rolled Nest wiring** — maintained and Zod-4-compatible, but would require building the validation-pipe/DTO-introspection/exception layer from scratch for no proven benefit over `nestjs-zod`, which already does this and passed every proof point.
- **Zod's native `z.toJSONSchema()` used standalone, no Nest library** — same rejection as above; still leaves Nest-specific plumbing unbuilt.
- **Custom minimal Zod/Nest adapter** — not justified; `nestjs-zod` cleared every proof requirement empirically, so building a replacement has no evidence-based rationale at this time.

## Known risks

1. **Stale peer-dependency range in `nestjs-zod@5.5.0`.** Confirmed cosmetic via pnpm's non-blocking warning and full runtime proof above, but any `pnpm install --frozen-lockfile` CI step should be checked to confirm it does not hard-fail on the peer warning (pnpm's default is warn-only, matching the spike; a stricter `strict-peer-dependencies` setting would need reverting or a documented, narrowly-scoped override, following the existing `pnpm-workspace.yaml` supply-chain-policy convention already used for other packages in the repo).
2. **Global-pipe validation via parameter-type reflection was not reliable in the spike** (only per-route `@UsePipes(new ZodValidationPipe(Dto))` binding was proven to work). T064 must either bind per-route explicitly (as proven) or separately verify global-pipe reflection with `emitDecoratorMetadata` before relying on it app-wide.
3. **Per-endpoint decorator discipline required.** Missing `@ApiBody`, `@ApiParam`, or an explicit `status` on `@ZodResponse` silently produces an incomplete or client-breaking OpenAPI document (proven three separate times above) rather than a build-time error. T066's drift/lint tooling should consider a check that every route with a body/param has the corresponding decorator, to catch this class of mistake before it reaches the committed document.
4. **`nestjs-zod`'s `ZodGuard`/`createZodGuard` are marked deprecated upstream** (validation should happen in pipes, not guards) — irrelevant to this spike's proof, but T064 should not reach for the guard-based API.
5. Exact patch-level drift: `zod@4.6.5` was `latest` at spike time (2026-09-14); Zod 4 is a young major line with an active release cadence. T064's implementation should pin the exact patch version used at implementation time (not `^4.6.5`) and re-verify the proofs above against that exact pin, per the repo's existing "exact reviewed version" convention for external dependencies.

## Verification required before this record can be Founder-approved

- Confirm exact patch versions to pin at T064 implementation time (this record's versions were current as of the spike date above).
- Re-run the per-route decorator-discipline proof against Slotnova's actual four Phase 1 endpoint schemas (this spike modeled them structurally but did not migrate the real files).
- Decide and document the `problem+json` filter wiring approach (extend the existing filter vs. `createValidationException` factory) referenced in the risks above.
