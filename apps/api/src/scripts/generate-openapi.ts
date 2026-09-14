/**
 * `pnpm --filter @slotnova/api openapi:generate` (T064,
 * `docs/decisions/0004-validation-contract-integration.md`). Boots a minimal
 * Nest application context (no `listen()`, no real database connectivity --
 * `DatabaseModule`'s pool is lazily connected, per `packages/db/src/client.ts`)
 * purely to let `@nestjs/swagger`'s `SwaggerModule.createDocument()`
 * introspect the identity module's `nestjs-zod` DTOs, then writes the
 * resulting OpenAPI document to `apps/api/openapi/openapi.json`.
 *
 * This is a build/generate-time script only -- it adds no runtime overhead
 * to the actual API process (`main.ts` never imports this file). It lives
 * under `src/scripts/` (built alongside the rest of `src/` by
 * `tsc -p tsconfig.build.json`) rather than being run directly via a
 * TS-in-place runner: NestJS's constructor-parameter DI relies on
 * `emitDecoratorMetadata`, which `tsx`'s esbuild-based transform does not
 * reproduce for every pattern -- confirmed by reproduction, `tsx` fails to
 * resolve `CapabilityGuard`'s `Reflector` dependency
 * (`UndefinedDependencyException`) on this exact module graph, while the
 * `tsc`-compiled output boots cleanly. The `openapi:generate` script
 * therefore runs the compiled `dist/scripts/generate-openapi.js` with plain
 * `node`, the same way `apps/api`'s own `start` script runs `dist/main.js`.
 *
 * Deterministic by construction (proven for the real document too, not only
 * the spike's structural model -- see the decision record's
 * "Deterministic-generation proof" and this task's verification step of
 * running this script twice and diffing): the document is built purely from
 * the Zod schemas' own static shape, with no timestamps, random ids, or
 * environment-dependent values written into it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { createApp } from "../main.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../../openapi/openapi.json");

async function main(): Promise<void> {
  // A minimal-but-valid DATABASE_URL is required for `DatabaseModule`'s
  // config resolution to not throw (`packages/db/src/config.ts`) -- the pool
  // it creates is lazily connected, so no real database is ever contacted
  // during document generation. `createApp()` (`../main.js`) is the same
  // bootstrap the real process and every integration test use -- reusing it
  // here (rather than a hand-rolled `NestFactory.create`) avoids duplicating
  // its plugin/hook wiring and keeps this script exercising the real DI graph.
  process.env["DATABASE_URL"] ??= "postgres://openapi-generate:unused@localhost:5432/unused";

  const app = await createApp();
  await app.init();

  const config = new DocumentBuilder()
    .setTitle("Slotnova API")
    .setDescription("Slotnova platform-foundation HTTP contract (Phase 1).")
    .setVersion("0.0.0")
    .build();

  const rawDocument = SwaggerModule.createDocument(app, config);
  const document = cleanupOpenApiDoc(rawDocument);

  await app.close();

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  // Stable key order + trailing newline so independent runs are byte-identical.
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  // eslint-disable-next-line no-console -- generation-script progress output, not application logging
  console.log(`OpenAPI document written to ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- last-resort sink for a build-time script
  console.error(error);
  process.exit(1);
});
