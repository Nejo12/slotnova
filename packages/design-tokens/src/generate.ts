import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { assertSlotnovaInput, reconcile } from "./reconcile.js";
import { renderCss, renderTs } from "./render.js";
import rawSlotnovaInput from "./input/slotnova-tokens.json" with { type: "json" };
import novaTokens from "@nova-component/design-tokens/tokens.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "generated");

async function main(): Promise<void> {
  const slotnovaInput = assertSlotnovaInput(rawSlotnovaInput);
  const result = reconcile(novaTokens, slotnovaInput);

  const cssPath = resolve(outDir, "tokens.css");
  const tsPath = resolve(outDir, "tokens.ts");

  // Format with this repo's own Prettier config so the committed output
  // matches `pnpm format:check` exactly — no separate manual formatting
  // step, and the file on disk is always what the generator produced.
  const prettierConfig = (await prettier.resolveConfig(cssPath)) ?? {};
  const css = await prettier.format(renderCss(result), { ...prettierConfig, filepath: cssPath });
  const ts = await prettier.format(renderTs(result), { ...prettierConfig, filepath: tsPath });

  await mkdir(outDir, { recursive: true });
  await writeFile(cssPath, css, "utf8");
  await writeFile(tsPath, ts, "utf8");

  // eslint-disable-next-line no-console
  console.log(`Generated ${outDir}/tokens.css and tokens.ts`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
