import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { build } from "vite";

const MARKER = "SLOTNOVA_E2E_HARNESS_MARKER";
const created: string[] = [];

// This test's own `vite build` resolves @slotnova/ui through its published
// `default` export condition (dist/index.js), not the `source` alias the
// root vitest config uses for other workspace packages — so it needs
// @slotnova/ui actually built. turbo.json's `test` task declares
// `dependsOn: ["^build"]`, but the root `pnpm test` script (and CI's fast
// lane, which runs `pnpm test` before `pnpm build`) calls vitest directly,
// bypassing that dependency graph. Build @slotnova/ui here rather than
// widening the CI-ordering fix beyond this test's own concern.
beforeAll(() => {
  const uiDist = new URL("../../../../packages/ui/dist/index.js", import.meta.url).pathname;
  if (!existsSync(uiDist)) {
    const repoRoot = new URL("../../../../", import.meta.url).pathname;
    execFileSync("pnpm", ["--filter", "@slotnova/ui", "build"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
});

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return nested.flat();
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("ordinary production bundle", () => {
  it("contains no test-harness module, route, or marker", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "slotnova-production-"));
    created.push(outDir);
    await build({
      configFile: new URL("../../vite.config.ts", import.meta.url).pathname,
      root: new URL("../../", import.meta.url).pathname,
      mode: "production",
      build: { outDir, emptyOutDir: true },
    });
    const files = await filesUnder(outDir);
    expect(files.some((file) => file.includes("test-harness"))).toBe(false);
    const output = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    expect(output).not.toContain(MARKER);
    expect(output).not.toContain("Slotnova test harness");
  });
});
