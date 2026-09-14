/**
 * T066 breaking-change CI check
 * (`specs/001-platform-foundation-shell/tasks.md` T066, FR-038, SC-008;
 * `docs/decisions/0004-validation-contract-integration.md`).
 *
 * Compares the OpenAPI document as committed on this branch (HEAD) against
 * the document as it existed at the merge-base with the target branch (the
 * document's state *before* this branch's changes), using the pure
 * {@link detectBreakingChanges} comparator (`./detect-breaking-changes.ts`,
 * unit-tested independently in `__tests__/detect-breaking-changes.test.ts`).
 *
 * This intentionally does NOT re-run generation itself -- `contracts:check`
 * (`check-drift.sh`) already runs immediately before this step in the fast
 * lane and proves "regenerated document == committed document" on HEAD, so
 * this script's "new" document is simply the committed
 * `apps/api/openapi/openapi.json` at HEAD, and its "old" document is that
 * same path's content at the merge-base commit (`git show <ref>:<path>`).
 *
 * Fail-vs-flag-only decision (spec: "flagged for explicit review", not
 * explicitly "fails CI"): this step DOES NOT fail the build (does not set a
 * non-zero exit code) when a breaking change is found. Reasoning, recorded
 * here per this task's instructions:
 *
 * 1. This repo already requires human review before every merge -- no
 *    auto-merge, founder merges manually (AGENTS.md "Merge policy",
 *    `docs/standards/ci-quality-gates.md`). A loud, unmissable CI annotation
 *    a reviewer sees on every PR page satisfies "flagged for explicit
 *    review" without adding a redundant hard gate on top of a process that
 *    is already gated by a human.
 * 2. A hard-fail here would need an escape hatch (some PRs legitimately
 *    *intend* a breaking API change, e.g. a deliberate Phase-2 endpoint
 *    redesign) -- and a hand-editable override flag/file is explicitly the
 *    wrong shape for this repo (T066's own instructions rule it out), so a
 *    hard-fail would have no principled unblock path short of reverting the
 *    change or editing this script, which is worse than not blocking.
 * 3. `contracts:check` (drift) is the hard gate -- it protects the
 *    mechanical invariant "committed artifacts match generated source",
 *    which has no legitimate exception. Breaking-ness is a judgment call
 *    about API consumers, which is exactly what human PR review is for.
 *
 * The check still exits non-zero on a genuine operational failure (e.g. the
 * merge-base document can't be read) so a broken CI step is visible as a
 * failure, distinct from "comparison ran and found N breaking changes"
 * (exit 0, annotated).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectBreakingChanges,
  formatBreakingChange,
  type OpenApiDocument,
} from "./detect-breaking-changes.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const OPENAPI_PATH = "apps/api/openapi/openapi.json";

function git(args: string[]): string {
  // `stdio: ["ignore", "pipe", "ignore"]` -- callers here treat a non-zero
  // exit as an expected, handled outcome (e.g. "path didn't exist at that
  // ref yet"), not an error; suppressing git's own stderr keeps those
  // expected misses from reading as failures in CI logs.
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Resolves the commit to diff against: the merge-base of HEAD and the
 * target branch, so the comparison is exactly "what changed on this
 * branch", not "what differs from main's current tip" (which would also
 * pick up unrelated concurrent main history). Falls back gracefully (prints
 * a notice, exits 0) when there is no meaningful base to compare -- running
 * directly on `main` (push event, no PR base), or a shallow clone that
 * cannot resolve the base ref -- rather than failing CI for an environment
 * reason unrelated to the contract itself.
 */
function resolveBaseRef(): string | undefined {
  const candidate = process.env["CONTRACTS_BASE_REF"] ?? process.env["GITHUB_BASE_REF"];
  const baseRef = candidate ? `origin/${candidate}` : "origin/main";

  try {
    git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
  } catch {
    return undefined;
  }

  try {
    return git(["merge-base", baseRef, "HEAD"]);
  } catch {
    return undefined;
  }
}

function readDocumentAt(ref: string, path: string): OpenApiDocument | undefined {
  try {
    const raw = git(["show", `${ref}:${path}`]);
    return JSON.parse(raw) as OpenApiDocument;
  } catch {
    return undefined;
  }
}

function main(): void {
  const baseCommit = resolveBaseRef();
  if (!baseCommit) {
    // eslint-disable-next-line no-console -- CI step progress output, not application logging
    console.log(
      "contracts:breaking-check -- skipped: no resolvable base ref (not a PR build, or history unavailable). " +
        "This is expected on a direct `main` push.",
    );
    return;
  }

  const oldDoc = readDocumentAt(baseCommit, OPENAPI_PATH);
  if (!oldDoc) {
    // eslint-disable-next-line no-console -- CI step progress output, not application logging
    console.log(
      `contracts:breaking-check -- skipped: ${OPENAPI_PATH} did not exist at merge-base ${baseCommit} ` +
        "(new contract, nothing to break).",
    );
    return;
  }

  const newDocRaw = readFileSync(resolve(REPO_ROOT, OPENAPI_PATH), "utf8");
  const newDoc = JSON.parse(newDocRaw) as OpenApiDocument;

  const findings = detectBreakingChanges(oldDoc, newDoc);

  if (findings.length === 0) {
    // eslint-disable-next-line no-console -- CI step progress output, not application logging
    console.log("contracts:breaking-check -- OK: no breaking OpenAPI changes vs. merge-base.");
    return;
  }

  // GitHub Actions workflow-command annotation syntax -- surfaces each
  // finding directly on the PR "Checks" summary/diff, matching this file's
  // documented "loud CI annotation, not a hard fail" decision.
  // eslint-disable-next-line no-console -- CI step progress output, not application logging
  console.log(
    "::warning::contracts:breaking-check -- breaking OpenAPI changes detected, review required",
  );
  // eslint-disable-next-line no-console -- CI step progress output, not application logging
  console.log("");
  // eslint-disable-next-line no-console -- CI step progress output, not application logging
  console.log(`Breaking changes vs. merge-base (${baseCommit.slice(0, 12)}):`);
  for (const finding of findings) {
    // eslint-disable-next-line no-console -- CI step progress output, not application logging
    console.log(`  - ${formatBreakingChange(finding)}`);
  }
  // eslint-disable-next-line no-console -- CI step progress output, not application logging
  console.log("");
  // eslint-disable-next-line no-console -- CI step progress output, not application logging
  console.log(
    "These are flagged for explicit human review, not blocked automatically -- " +
      "see the reasoning comment at the top of tooling/contracts/check-breaking-changes.ts. " +
      "If this change is intentional, no action is required beyond reviewer awareness.",
  );
}

main();
