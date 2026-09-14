/**
 * `pnpm --filter @slotnova/contracts contracts:generate` (T065,
 * `docs/decisions/0004-validation-contract-integration.md` "Generated
 * client/types/MSW feasibility proof").
 *
 * Reads the API's already-committed OpenAPI document
 * (`apps/api/openapi/openapi.json`, produced by T064's
 * `pnpm --filter @slotnova/api openapi:generate`) as this script's sole input
 * -- it never re-runs the API's own generator or imports anything from
 * `apps/api`. That keeps this task's generated-client/types/MSW step a pure
 * consumer of T064's committed contract, matching the proven spike pattern
 * (the spike's client/handler files had "no import path back to the Nest
 * module at all").
 *
 * Two outputs are written under `src/generated/`:
 * - `openapi.json` -- a verbatim copy of the API's document, so this
 *   package's generated output is self-contained and reviewable without
 *   cross-referencing `apps/api`.
 * - `types.ts` -- `openapi-typescript`'s `paths`/`components` types, via its
 *   Node API (`openapiTS` + `astToString`), formatted with this repo's own
 *   Prettier config so committed output matches `pnpm format:check` exactly
 *   (same approach as `packages/design-tokens/src/generate.ts`).
 *
 * Deterministic by construction: both outputs are pure functions of the
 * committed input document, with no timestamps or environment-dependent
 * values. Verified empirically per this task's instructions by running this
 * script twice and diffing `src/generated/`.
 *
 * `src/index.ts` and `src/msw/index.ts` are NOT written by this script --
 * they are thin static adapters (`createClient<paths>()` /
 * `createOpenApiHttp<paths>()`) that import `./generated/types.js`, matching
 * the decision record's distinction between pure generation (the types file)
 * and thin typed wrappers with no per-endpoint logic (the client/MSW
 * factories).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import openapiTS, { astToString } from "openapi-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const API_OPENAPI_PATH = resolve(here, "../../../apps/api/openapi/openapi.json");
const OUT_DIR = resolve(here, "generated");

async function main(): Promise<void> {
  const rawDocument = await readFile(API_OPENAPI_PATH, "utf8");
  const document: unknown = JSON.parse(rawDocument);

  const openapiJsonPath = resolve(OUT_DIR, "openapi.json");
  const typesPath = resolve(OUT_DIR, "types.ts");

  const prettierConfig = (await prettier.resolveConfig(typesPath)) ?? {};
  // Re-serialize (rather than copy the raw bytes) so this package's own copy
  // has one deterministic key order/formatting independent of how the API's
  // generator happened to write its file -- both are stable, but this keeps
  // `src/generated/openapi.json` self-consistent with the rest of this
  // package's generated output and immune to `format:check` drift.
  const openapiJson = await prettier.format(JSON.stringify(document), {
    ...prettierConfig,
    filepath: openapiJsonPath,
  });

  const ast = await openapiTS(document as Parameters<typeof openapiTS>[0]);
  const types = await prettier.format(astToString(ast), {
    ...prettierConfig,
    filepath: typesPath,
  });

  const header =
    "// GENERATED FILE -- DO NOT EDIT. Run `pnpm --filter @slotnova/contracts contracts:generate`.\n" +
    "// Source: apps/api/openapi/openapi.json (task T064). See task T065 /\n" +
    "// docs/decisions/0004-validation-contract-integration.md.\n\n";

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(openapiJsonPath, openapiJson, "utf8");
  await writeFile(typesPath, `${header}${types}`, "utf8");

  // eslint-disable-next-line no-console -- generation-script progress output, not application logging
  console.log(`Generated ${openapiJsonPath} and ${typesPath}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- last-resort sink for a build-time script
  console.error(error);
  process.exitCode = 1;
});
