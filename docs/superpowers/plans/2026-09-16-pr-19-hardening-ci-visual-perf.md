# PR-19 (T085–T089) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten dependency-cruiser rules, enforce zero real-provider network egress in ordinary CI with a separate provider-smoke lane, complete the heavy CI lane, add targeted visual regression for the 9 existing system-state Storybook stories, and record real performance baselines with the budget-check mechanism (budget value itself left pending founder approval).

**Architecture:** Five additive, independently-testable slices layered onto the existing monorepo: (1) three new `dependency-cruiser` `forbidden` rules plus fixtures, (2) a Vitest global setup module that blocks unmocked HTTP/fetch egress plus a new `provider-smoke.yml` workflow, (3) `heavy.yml` gains axe + visual-regression + a security reference alongside its existing migration jobs, composing rather than duplicating `e2e.yml`, (4) a Storybook-build + Playwright-screenshot visual regression harness for the 9 existing stories in Light/Dark, (5) a measured `perf-baselines.md` plus a small budget-check script wired for later enforcement.

**Tech Stack:** dependency-cruiser, Vitest, MSW (`msw/node`), Playwright, Storybook (`@storybook/react-vite`), GitHub Actions, pnpm/Turborepo, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-16-pr-19-hardening-ci-visual-perf-design.md`

## Global Constraints

- Node runtime for all local verification: `24.20.0` via nvm (`export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH"` — the default shell node is v22 and diverges from CI).
- Additive only: none of the 7 existing `forbidden` rules in `.dependency-cruiser.cjs` may be edited or weakened.
- No real provider SDK integration or credentials committed anywhere in fast/heavy lanes; provider-smoke secrets scoped only to `provider-smoke.yml`.
- No product-domain code changes anywhere in this PR.
- T089's heavy-lane time budget stays an explicit pending placeholder — never recorded as agreed until the founder approves a number after the completed heavy workflow has run in GitHub Actions.
- No merge, no auto-merge — founder merges manually.
- Working directory for all implementation: `/Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf` (worktree on branch `feat/pr-19-hardening-ci-visual-perf`, already created from verified `origin/main` @ `33aa0a6c98b7dd20e295daa1bda38a4eddd0cf41`).
- Follow TDD: write the failing test/fixture first, verify it fails for the right reason, then implement.

---

## Task 1: Dependency-cruiser — per-module public-entry rule (`audit`, `identity`)

**Files:**
- Modify: `tooling/dependency-cruiser/.dependency-cruiser.cjs`
- Create: `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/audit/index.ts`
- Create: `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/audit/domain/audit-log.ts`
- Create: `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/identity/bad.ts`
- Modify: `tooling/dependency-cruiser/__fixtures__/compliant/apps/web/src/good.ts` (no change needed — verify existing compliant fixture doesn't trip the new rule; add a compliant same-module case instead, see Step 5)
- Test: `tooling/dependency-cruiser/__tests__/rules.test.ts`

**Interfaces:**
- Produces: new rule name `"module-public-entry-only"` in the `forbidden` array of `.dependency-cruiser.cjs`, consumed by Task 4's fixture-completeness check and by `rules.test.ts`'s `VIOLATION_CASES`.

- [ ] **Step 1: Write the failing fixture + test case**

Create `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/audit/domain/audit-log.ts`:

```typescript
export const AUDIT_LOG_MARKER = "audit-domain-internal";
```

Create `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/audit/index.ts`:

```typescript
export { AUDIT_LOG_MARKER } from "./domain/audit-log.js";
```

Create `tooling/dependency-cruiser/__fixtures__/module-public-entry-only/apps/api/src/modules/identity/bad.ts` (this is the violating file — a sibling module reaching into `audit`'s internals instead of its public `index.ts`):

```typescript
// Violates module-public-entry-only: reaches into audit's domain internals
// instead of importing from apps/api/src/modules/audit/index.ts.
import { AUDIT_LOG_MARKER } from "../audit/domain/audit-log.js";

export const IDENTITY_USES_AUDIT_MARKER = AUDIT_LOG_MARKER;
```

In `tooling/dependency-cruiser/__tests__/rules.test.ts`, add `"module-public-entry-only"` to the `VIOLATION_CASES` array (after the existing `"no-cross-module-internals"` entry):

```typescript
const VIOLATION_CASES: ReadonlyArray<readonly [fixture: string, rule: string]> = [
  ["no-circular", "no-circular"],
  ["ui-not-to-infra", "ui-not-to-infra"],
  ["domain-not-to-provider-sdk", "domain-not-to-provider-sdk"],
  ["no-cross-module-internals", "no-cross-module-internals"],
  ["no-observability-server-in-browser", "no-observability-server-in-browser"],
  ["no-deep-import-across-packages", "no-deep-import-across-packages"],
  ["module-public-entry-only", "module-public-entry-only"],
];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "module-public-entry-only"`
Expected: FAIL — the fixture cruise returns no violation for a rule that doesn't exist yet (the test expects `"module-public-entry-only"` to be in the violated-rules list, but no such rule exists so it can never fire).

- [ ] **Step 3: Add the rule to `.dependency-cruiser.cjs`**

In `tooling/dependency-cruiser/.dependency-cruiser.cjs`, add a new entry to the `forbidden` array, after `no-cross-module-internals` (which stays untouched):

```javascript
    {
      name: "module-public-entry-only",
      comment:
        "apps/api/src/modules/{audit,identity} have a settled public-entry " +
        "convention (index.ts) — a sibling module or any outside caller must " +
        "import through it, not reach into application/domain/infrastructure/http " +
        "internals directly (T085, tightening no-cross-module-internals beyond " +
        "infrastructure/repositories/repository/schema to all internal layers " +
        "for the two modules that already have this convention). " +
        "apps/api/src/modules/platform has no single public-entry file today " +
        "(independent sub-features: database, health, outbox, security, tenancy) " +
        "and is deliberately out of scope for this rule rather than having one " +
        "invented for it.",
      severity: "error",
      from: {
        path: "^apps/api/src/modules/(audit|identity)/",
        pathNot: "/(__tests__|__fixtures__)/",
      },
      to: {
        path: "^apps/api/src/modules/(audit|identity)/(application|domain|infrastructure|http)/",
        pathNot: "^apps/api/src/modules/$1/(application|domain|infrastructure|http)/",
      },
    },
```

- [ ] **Step 4: Run test to verify the violation fires**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "module-public-entry-only"`
Expected: PASS

- [ ] **Step 5: Add a compliant same-module case and verify it does NOT trip the rule**

Create `tooling/dependency-cruiser/__fixtures__/module-public-entry-only-compliant/apps/api/src/modules/audit/domain/audit-log.ts` (same content as Step 1's) and `tooling/dependency-cruiser/__fixtures__/module-public-entry-only-compliant/apps/api/src/modules/audit/index.ts` (same content as Step 1's) plus a same-module consumer:

`tooling/dependency-cruiser/__fixtures__/module-public-entry-only-compliant/apps/api/src/modules/audit/application/use-case.ts`:

```typescript
// Compliant: same-module file reaching its own domain internals directly is fine.
import { AUDIT_LOG_MARKER } from "../domain/audit-log.js";

export const USE_CASE_MARKER = AUDIT_LOG_MARKER;
```

Add a test in `rules.test.ts` (after the existing "compliant fixture trips no rule" test):

```typescript
  it("the module-public-entry-only-compliant fixture trips no rule", async () => {
    expect(await violatedRules("module-public-entry-only-compliant")).toEqual([]);
  });
```

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts`
Expected: PASS — all tests in the file, including the pre-existing ones (confirms nothing was weakened).

- [ ] **Step 6: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add tooling/dependency-cruiser/.dependency-cruiser.cjs tooling/dependency-cruiser/__fixtures__/module-public-entry-only tooling/dependency-cruiser/__fixtures__/module-public-entry-only-compliant tooling/dependency-cruiser/__tests__/rules.test.ts
git commit -m "feat(t085): add module-public-entry-only dependency-cruiser rule"
```

---

## Task 2: Dependency-cruiser — test-harness production-graph exclusion rule

**Files:**
- Modify: `tooling/dependency-cruiser/.dependency-cruiser.cjs`
- Create: `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph/apps/web/src/test-harness/TestHarness.tsx`
- Create: `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph/apps/web/src/app/bad-static-import.ts`
- Create: `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph-compliant/apps/web/src/test-harness/TestHarness.tsx`
- Create: `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph-compliant/apps/web/src/app/router.tsx`
- Test: `tooling/dependency-cruiser/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: new rule name `"test-harness-not-in-production-graph"`, consumed by Task 4's completeness check.

- [ ] **Step 1: Write the failing fixture + test case**

Create `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph/apps/web/src/test-harness/TestHarness.tsx`:

```typescript
export const TEST_HARNESS_MARKER = "test-harness";
```

Create `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph/apps/web/src/app/bad-static-import.ts` (the violation — a **static**, non-router import):

```typescript
// Violates test-harness-not-in-production-graph: a static import of the
// harness from ordinary application code, not the one allowlisted dynamic
// import() in apps/web/src/app/router.tsx.
import { TEST_HARNESS_MARKER } from "../test-harness/TestHarness.js";

export const LEAKED_MARKER = TEST_HARNESS_MARKER;
```

In `tooling/dependency-cruiser/__tests__/rules.test.ts`, add to `VIOLATION_CASES`:

```typescript
  ["test-harness-not-in-production-graph", "test-harness-not-in-production-graph"],
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "test-harness-not-in-production-graph"`
Expected: FAIL (rule doesn't exist yet)

- [ ] **Step 3: Add the rule**

In `tooling/dependency-cruiser/.dependency-cruiser.cjs`, add after `module-public-entry-only`:

```javascript
    {
      name: "test-harness-not-in-production-graph",
      comment:
        "apps/web/src/test-harness must never appear in the production import " +
        "graph (T085; hard product invariant, docs/standards/ci-quality-gates.md). " +
        "The only sanctioned entry point is the single dynamic import() in " +
        "apps/web/src/app/router.tsx behind the VITE_E2E gate; any other file " +
        "outside test-harness/ or e2e/ reaching in — especially a static import " +
        "dependency-cruiser can see at analysis time — is forbidden. This is " +
        "defense-in-depth alongside (not a replacement for) the build-output " +
        "proof in apps/web/src/__tests__/production-bundle.test.ts, which " +
        "remains the authoritative production-exclusion check.",
      severity: "error",
      from: {
        path: "^apps/web/",
        pathNot: [
          "^apps/web/src/test-harness/",
          "^apps/web/e2e/",
          "^apps/web/src/app/router\\.tsx$",
        ].join("|"),
      },
      to: { path: "^apps/web/src/test-harness/" },
    },
```

- [ ] **Step 4: Run test to verify the violation fires**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "test-harness-not-in-production-graph"`
Expected: PASS

- [ ] **Step 5: Add compliant fixture (router's dynamic import is allowed) and verify**

Create `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph-compliant/apps/web/src/test-harness/TestHarness.tsx` (same content as Step 1).

Create `tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph-compliant/apps/web/src/app/router.tsx`:

```typescript
// Compliant: the one sanctioned entry point, matching the real
// apps/web/src/app/router.tsx pattern — a dynamic import behind VITE_E2E.
export async function loadTestHarnessRoute() {
  if (import.meta.env.VITE_E2E !== "true") return null;
  return import("../test-harness/TestHarness.js");
}
```

Add test in `rules.test.ts`:

```typescript
  it("the test-harness-not-in-production-graph-compliant fixture trips no rule", async () => {
    expect(await violatedRules("test-harness-not-in-production-graph-compliant")).toEqual([]);
  });
```

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts`
Expected: PASS — all tests.

- [ ] **Step 6: Verify the real production build still passes its existing exclusion test**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run apps/web/src/__tests__/production-bundle.test.ts`
Expected: PASS (unchanged; confirms the new rule didn't require touching this test)

- [ ] **Step 7: Run the real repo's own lint:boundaries against the new rule (sanity check no real file violates it)**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm lint:boundaries`
Expected: PASS — the real `apps/web/src/app/router.tsx` only reaches `test-harness` via the allowlisted dynamic import, so no real violation.

- [ ] **Step 8: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add tooling/dependency-cruiser/.dependency-cruiser.cjs tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph tooling/dependency-cruiser/__fixtures__/test-harness-not-in-production-graph-compliant tooling/dependency-cruiser/__tests__/rules.test.ts
git commit -m "feat(t085): add test-harness-not-in-production-graph dependency-cruiser rule"
```

---

## Task 3: Dependency-cruiser — contracts generated-only import direction

**Files:**
- Modify: `tooling/dependency-cruiser/.dependency-cruiser.cjs`
- Create: `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/generated/types.ts`
- Create: `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/generated/bad-reaches-handwritten.ts`
- Create: `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/msw/index.ts`
- Test: `tooling/dependency-cruiser/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: new rule name `"contracts-generated-import-direction"`, consumed by Task 4's completeness check.
- Ground truth from exploration: `packages/contracts/package.json` already declares an `exports` map limited to `"."` (→ `src/index.ts`) and `"./msw"` (→ `src/msw/index.ts`); `generated/*` has no exported subpath at all, so the existing `no-deep-import-across-packages` rule already blocks *other packages* from deep-importing `packages/contracts/src/generated/*`. The genuinely new gap is the **reverse** direction within the same package: nothing stops `generated/**` (which is regenerated code, never hand-edited) from importing hand-written internals like `msw/index.ts`, which would be a surprising, easy-to-miss coupling if it ever happened. This rule closes that gap.

- [ ] **Step 1: Write the failing fixture + test case**

Create `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/msw/index.ts`:

```typescript
export const MSW_ADAPTER_MARKER = "hand-written-msw-adapter";
```

Create `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/generated/types.ts`:

```typescript
export type GeneratedPaths = Record<string, unknown>;
```

Create `tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction/packages/contracts/src/generated/bad-reaches-handwritten.ts` (the violation — generated code importing hand-written code):

```typescript
// Violates contracts-generated-import-direction: generated/** is produced by
// `contracts:generate` and must never depend on hand-written package internals.
import { MSW_ADAPTER_MARKER } from "../msw/index.js";

export const LEAKED = MSW_ADAPTER_MARKER;
```

In `rules.test.ts`, add to `VIOLATION_CASES`:

```typescript
  ["contracts-generated-import-direction", "contracts-generated-import-direction"],
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "contracts-generated-import-direction"`
Expected: FAIL (rule doesn't exist yet)

- [ ] **Step 3: Add the rule**

In `.dependency-cruiser.cjs`, add after `test-harness-not-in-production-graph`:

```javascript
    {
      name: "contracts-generated-import-direction",
      comment:
        "packages/contracts/src/generated/** is produced by `contracts:generate` " +
        "and never hand-edited (ADR-013, T065) — it must not depend on the " +
        "package's own hand-written internals (src/index.ts, src/msw/**, " +
        "src/generate.ts). Other packages deep-importing generated/* directly " +
        "are already blocked by no-deep-import-across-packages, since " +
        "packages/contracts/package.json only exports '.' and './msw' (T085).",
      severity: "error",
      from: { path: "^packages/contracts/src/generated/" },
      to: {
        path: "^packages/contracts/src/",
        pathNot: "^packages/contracts/src/generated/",
      },
    },
```

- [ ] **Step 4: Run test to verify the violation fires**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts -t "contracts-generated-import-direction"`
Expected: PASS

- [ ] **Step 5: Verify the real repo's generated files are compliant**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm lint:boundaries`
Expected: PASS — real `packages/contracts/src/generated/{openapi.json,types.ts}` are pure data/types with no imports into hand-written code.

- [ ] **Step 6: Run the full rules.test.ts suite and confirm the "every core forbidden rule is covered by a fixture" completeness check still passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts`
Expected: PASS — all tests, including "every core forbidden rule is covered by a fixture" (this will now also cover the 3 new T085 rules since they're all listed in `VIOLATION_CASES`).

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add tooling/dependency-cruiser/.dependency-cruiser.cjs tooling/dependency-cruiser/__fixtures__/contracts-generated-import-direction tooling/dependency-cruiser/__tests__/rules.test.ts
git commit -m "feat(t085): add contracts-generated-import-direction dependency-cruiser rule"
```

---

## Task 4: T085 wrap-up — mark task complete in tasks.md

**Files:**
- Modify: `specs/001-platform-foundation-shell/tasks.md:830`

**Interfaces:**
- Consumes: Tasks 1–3's three new rule names, all passing.

- [ ] **Step 1: Run the full dependency-cruiser test suite one more time as final proof**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/dependency-cruiser/__tests__/rules.test.ts && pnpm lint:boundaries`
Expected: both PASS

- [ ] **Step 2: Check the T085 box**

In `specs/001-platform-foundation-shell/tasks.md`, change line 830 from:
```
- [ ] T085 Dependency-cruiser rule **tightening** (beyond the core set)
```
to:
```
- [x] T085 Dependency-cruiser rule **tightening** (beyond the core set)
```

- [ ] **Step 3: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add specs/001-platform-foundation-shell/tasks.md
git commit -m "chore(t085): mark T085 complete"
```

---

## Task 5: Network-egress guard — global Vitest setup module

**Files:**
- Create: `packages/testing/src/msw/deny-network.ts`
- Create: `packages/testing/src/msw/__tests__/deny-network.test.ts`
- Modify: `packages/testing/src/index.ts` (do NOT export this from the root — it's a setup-file-only module, following the same "node-only, never re-exported from package root" pattern as `msw/node.ts`; verify this by reading `packages/testing/src/index.ts` first)

**Interfaces:**
- Consumes: nothing new.
- Produces: `installNetworkDenylist(): { restore(): void }` — a function that patches global `fetch` and Node's `http`/`https` `request`/`get` to throw a clear `NetworkDenylistError` for any target host that is not `127.0.0.1`, `localhost`, or `::1`. Consumed by Task 6 (root `vitest.config.ts` `setupFiles` wiring) and Task 7 (integration config wiring).

- [ ] **Step 1: Read `packages/testing/src/index.ts` to confirm it doesn't currently re-export `msw/node.ts` (so the new file follows the same convention)**

Run: `cat /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf/packages/testing/src/index.ts`

Confirm `msw/node.ts` is absent from its exports (per exploration, it's node-only and never re-exported from the root). The new `deny-network.ts` will follow the identical pattern — no root re-export.

- [ ] **Step 2: Write the failing test**

Create `packages/testing/src/msw/__tests__/deny-network.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";

import { installNetworkDenylist } from "../deny-network.js";

describe("installNetworkDenylist", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("blocks a real fetch() to a non-local host with a clear error", async () => {
    ({ restore } = installNetworkDenylist());
    await expect(fetch("https://example.com/definitely-not-mocked")).rejects.toThrow(
      /NetworkDenylistError/,
    );
  });

  it("does not block fetch() to 127.0.0.1", async () => {
    ({ restore } = installNetworkDenylist());
    // A connection refused error (no server listening) proves the denylist
    // let the attempt through to the real network stack instead of blocking
    // it pre-emptively -- it must NOT throw NetworkDenylistError.
    await expect(fetch("http://127.0.0.1:1")).rejects.not.toThrow(/NetworkDenylistError/);
  });

  it("does not block fetch() to localhost", async () => {
    ({ restore } = installNetworkDenylist());
    await expect(fetch("http://localhost:1")).rejects.not.toThrow(/NetworkDenylistError/);
  });

  it("restore() returns fetch to its original, unpatched behavior", async () => {
    const originalFetch = globalThis.fetch;
    ({ restore } = installNetworkDenylist());
    expect(globalThis.fetch).not.toBe(originalFetch);
    restore();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw/__tests__/deny-network.test.ts`
Expected: FAIL with "Cannot find module '../deny-network.js'"

- [ ] **Step 4: Implement `deny-network.ts`**

Create `packages/testing/src/msw/deny-network.ts`:

```typescript
/**
 * `@slotnova/testing/msw/deny-network` — global HTTP/fetch egress guard (task T086).
 *
 * MSW's `onUnhandledRequest: "error"` (see `./node.ts`) only protects test
 * files that opt into an MSW server. This module is the second, mandatory
 * layer: it patches global `fetch` and Node's `http`/`https` request path so
 * that *any* outbound HTTP(S) call to a non-local host fails immediately and
 * loudly, whether or not the calling code goes through MSW at all.
 *
 * Deliberately scoped to HTTP(S)/fetch only — the transport every real
 * provider SDK (Stripe, Twilio, SendGrid, Slack, AWS SDK v3, etc.) uses.
 * Raw TCP (the `pg` driver talking to a Testcontainers PostgreSQL instance,
 * or Docker's own socket) is untouched, so real-PostgreSQL integration tests
 * keep working unmodified.
 */

import * as http from "node:http";
import * as https from "node:https";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class NetworkDenylistError extends Error {
  constructor(host: string) {
    super(
      `NetworkDenylistError: blocked outbound HTTP(S) request to non-local host "${host}". ` +
        "Ordinary test runs must not make real external-provider calls -- mock this " +
        "call with MSW (see @slotnova/testing/msw/node), or if this is genuinely " +
        "local infrastructure, confirm the host is 127.0.0.1/localhost.",
    );
    this.name = "NetworkDenylistError";
  }
}

function hostFromUrlLike(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input, "http://localhost") : input;
  return url.hostname;
}

function assertLocalHost(host: string): void {
  if (!LOCAL_HOSTS.has(host)) {
    throw new NetworkDenylistError(host);
  }
}

export interface NetworkDenylistHandle {
  restore(): void;
}

/**
 * Patch global `fetch`, `http.request`/`http.get`, and `https.request`/
 * `https.get` to reject any call whose target host is not 127.0.0.1,
 * localhost, or ::1. Call `.restore()` to undo.
 */
export function installNetworkDenylist(): NetworkDenylistHandle {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const target = input instanceof Request ? input.url : input;
    assertLocalHost(hostFromUrlLike(target as string | URL));
    return originalFetch(input, init);
  }) as typeof fetch;

  function guardedRequest<T extends typeof http.request | typeof https.request>(
    original: T,
  ): T {
    return ((...args: Parameters<T>) => {
      const [first] = args;
      let host: string;
      if (typeof first === "string" || first instanceof URL) {
        host = hostFromUrlLike(first);
      } else {
        host = (first as http.RequestOptions).hostname ?? (first as http.RequestOptions).host ?? "localhost";
      }
      assertLocalHost(host);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarding original call signature
      return (original as any)(...args);
    }) as T;
  }

  http.request = guardedRequest(originalHttpRequest);
  http.get = guardedRequest(originalHttpGet);
  https.request = guardedRequest(originalHttpsRequest);
  https.get = guardedRequest(originalHttpsGet);

  return {
    restore(): void {
      globalThis.fetch = originalFetch;
      http.request = originalHttpRequest;
      http.get = originalHttpGet;
      https.request = originalHttpsRequest;
      https.get = originalHttpsGet;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw/__tests__/deny-network.test.ts`
Expected: PASS (4/4 tests)

- [ ] **Step 6: Run the existing MSW node test to confirm no regression**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw/__tests__/msw-node.test.ts`
Expected: PASS (unchanged — `deny-network.ts` isn't wired into global setup yet, this just confirms the new file didn't break anything by existing)

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add packages/testing/src/msw/deny-network.ts packages/testing/src/msw/__tests__/deny-network.test.ts
git commit -m "feat(t086): add network egress denylist for HTTP(S)/fetch"
```

---

## Task 6: Wire the network denylist into root Vitest config + prove the bypass case

**Files:**
- Create: `packages/testing/src/msw/deny-network.setup.ts`
- Modify: `vitest.config.ts`
- Create: `packages/testing/src/msw/__tests__/deny-network-bypass.test.ts`

**Interfaces:**
- Consumes: `installNetworkDenylist` from Task 5.
- Produces: the setup file path `packages/testing/src/msw/deny-network.setup.ts`, referenced by `vitest.config.ts`'s `test.setupFiles` and reused in Task 7 for the two integration configs.

- [ ] **Step 1: Write the failing "deliberately unmocked provider call" fixture test**

Create `packages/testing/src/msw/__tests__/deny-network-bypass.test.ts` — this is the T086 acceptance-criteria proof ("a deliberately un-mocked provider call in a normal test run is blocked/flagged"), written as a **plain fetch with no MSW server at all**, to prove the socket-level guard (not MSW) is what catches it:

```typescript
import { describe, expect, it } from "vitest";

// Deliberately does NOT set up an MSW server -- this test proves the global
// denylist (wired via vitest.config.ts setupFiles) catches a raw, completely
// unmocked outbound call on its own, independent of MSW.
describe("global network denylist (no MSW server in this file)", () => {
  it("blocks a real, un-mocked call to what would be a provider endpoint", async () => {
    await expect(fetch("https://api.stripe.com/v1/charges")).rejects.toThrow(
      /NetworkDenylistError/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails (guard not wired globally yet)**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw/__tests__/deny-network-bypass.test.ts`
Expected: FAIL — the real `https://api.stripe.com` call either times out or actually attempts a connection (not yet blocked), since nothing installs the denylist globally yet.

- [ ] **Step 3: Create the setup-file wrapper**

Create `packages/testing/src/msw/deny-network.setup.ts`:

```typescript
/**
 * Vitest `setupFiles` entry (task T086) -- installs the global HTTP(S)/fetch
 * denylist for every test in the run, without requiring each test file to
 * opt in. See ./deny-network.ts for what it blocks and why.
 */
import { installNetworkDenylist } from "./deny-network.js";

installNetworkDenylist();
```

- [ ] **Step 4: Wire it into root `vitest.config.ts`**

Modify `vitest.config.ts` — add `setupFiles` inside the `test` block (after the existing `env` line):

```typescript
    env: { SLOTNOVA_ENV: "preview" },
    setupFiles: ["./packages/testing/src/msw/deny-network.setup.ts"],
    environment: "node",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw/__tests__/deny-network-bypass.test.ts`
Expected: PASS

- [ ] **Step 6: Run the ENTIRE fast-lane unit/property test suite to confirm no existing test makes a real external call that the new guard now breaks**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm test`
Expected: PASS — every existing test file either doesn't touch the network, or already goes through MSW against `https://api.slotnova.test` which is NOT in the local-hosts allowlist, so this step doubles as a check that MSW-mocked calls still work correctly under the new global patch (MSW intercepts before the patched `fetch`/`http` ever reaches the real dispatcher, since MSW installs its own interceptor layer at `server.listen()` time). If any test fails here, read its failure and determine whether it's a real unmocked call (fix by adding an MSW handler) or an ordering issue between MSW's interceptor and the denylist patch (fix by installing the denylist patch to check MSW's interception state first — investigate `msw`'s interceptor internals if this occurs, do not weaken the denylist).

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add packages/testing/src/msw/deny-network.setup.ts vitest.config.ts packages/testing/src/msw/__tests__/deny-network-bypass.test.ts
git commit -m "feat(t086): wire network denylist into root Vitest setupFiles"
```

---

## Task 7: Wire the network denylist into API + worker integration Vitest configs

**Files:**
- Modify: `apps/api/vitest.integration.config.ts`
- Modify: `apps/worker/vitest.integration.config.ts`

**Interfaces:**
- Consumes: `packages/testing/src/msw/deny-network.setup.ts` from Task 6.

- [ ] **Step 1: Add `setupFiles` to `apps/api/vitest.integration.config.ts`**

Modify `apps/api/vitest.integration.config.ts` — add `setupFiles` inside the `test` block:

```typescript
    env: { SLOTNOVA_ENV: "preview", API_RATE_LIMIT_AUTH_MAX: "1000" },
    setupFiles: ["../../packages/testing/src/msw/deny-network.setup.ts"],
    environment: "node",
```

- [ ] **Step 2: Add `setupFiles` to `apps/worker/vitest.integration.config.ts`**

Read the file first to get its exact current `test` block shape, then add the equivalent `setupFiles` line with the correct relative path (`../../packages/testing/src/msw/deny-network.setup.ts` from `apps/worker/`).

- [ ] **Step 3: Run the API integration suite to confirm real-PostgreSQL/Testcontainers connections are unaffected**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm --filter @slotnova/db test:integration`
Expected: PASS — this exercises Testcontainers (raw TCP to Postgres), which the guard deliberately never touches. Requires Docker/Podman running locally; if unavailable, note this in the final report as an environment limitation and rely on the heavy-lane CI run for authoritative proof.

- [ ] **Step 4: Run the API's own integration suite if Docker is available locally**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm --filter @slotnova/api test:integration`
Expected: PASS if Docker is available; otherwise note as a local environment limitation, deferring to CI.

- [ ] **Step 5: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add apps/api/vitest.integration.config.ts apps/worker/vitest.integration.config.ts
git commit -m "feat(t086): wire network denylist into api/worker integration configs"
```

---

## Task 8: `provider-smoke.yml` workflow

**Files:**
- Create: `.github/workflows/provider-smoke.yml`
- Create: `tooling/provider-smoke/check-seam.ts`
- Create: `tooling/provider-smoke/__tests__/check-seam.test.ts`

**Interfaces:**
- Produces: a `pnpm exec tsx tooling/provider-smoke/check-seam.ts` script the workflow runs, and the workflow file itself.

- [ ] **Step 1: Write the failing test for the seam-check script**

Create `tooling/provider-smoke/__tests__/check-seam.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { checkProviderSmokeSeam } from "../check-seam.js";

describe("checkProviderSmokeSeam", () => {
  it("reports the seam is wired when the marker env var is present", () => {
    const result = checkProviderSmokeSeam({ PROVIDER_SMOKE_SEAM: "1" });
    expect(result.seamWired).toBe(true);
    expect(result.hasRealProviderAdapter).toBe(false);
    expect(result.summary).toMatch(/no Phase-1 provider adapter exists yet/i);
  });

  it("reports the seam is NOT wired when the marker env var is absent", () => {
    const result = checkProviderSmokeSeam({});
    expect(result.seamWired).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/provider-smoke/__tests__/check-seam.test.ts`
Expected: FAIL with "Cannot find module '../check-seam.js'"

- [ ] **Step 3: Implement `check-seam.ts`**

Create `tooling/provider-smoke/check-seam.ts`:

```typescript
/**
 * Provider-smoke seam check (task T086).
 *
 * Phase 1 has no real provider adapter or sandbox contract yet (no
 * billing/notifications module exists under apps/api/src/modules). This
 * script deliberately does NOT fabricate a provider integration or claim a
 * sandbox was exercised. It proves the narrow, isolated-credential lane
 * mechanism itself: that provider-smoke.yml's scoped secrets context is
 * wired and reachable, distinct from fast/heavy lane secrets. Once a real
 * Phase-1 provider adapter exists, this script is the place to add the
 * actual sandbox contract call.
 */

export interface ProviderSmokeSeamResult {
  seamWired: boolean;
  hasRealProviderAdapter: boolean;
  summary: string;
}

export function checkProviderSmokeSeam(
  env: Record<string, string | undefined>,
): ProviderSmokeSeamResult {
  const seamWired = env.PROVIDER_SMOKE_SEAM === "1";
  return {
    seamWired,
    hasRealProviderAdapter: false,
    summary: seamWired
      ? "provider-smoke lane seam is wired (scoped secret/marker reachable). " +
        "no Phase-1 provider adapter exists yet -- this lane currently proves " +
        "the isolated-credential CI mechanism, not a real provider sandbox round-trip."
      : "provider-smoke lane seam marker is NOT set -- scoped context is not reachable.",
  };
}

function main(): void {
  const result = checkProviderSmokeSeam(process.env);
  console.log(result.summary);
  if (!result.seamWired) {
    console.error("provider-smoke: seam check failed -- PROVIDER_SMOKE_SEAM not set");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/provider-smoke/__tests__/check-seam.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Create `.github/workflows/provider-smoke.yml`**

```yaml
# Provider-smoke lane (task T086). Manual + scheduled only -- never runs on
# pull_request or push, so provider secrets never reach fast/heavy CI.
#
# Phase 1 has no real provider adapter/sandbox yet (no billing/notifications
# module exists). This workflow does not fabricate one: it proves the
# isolated-credential lane mechanism via tooling/provider-smoke/check-seam.ts
# and documents its current no-provider state truthfully. Extend
# check-seam.ts with a real sandbox contract call once a Phase-1 provider
# adapter exists.
name: provider-smoke

on:
  workflow_dispatch: {}
  schedule:
    - cron: "0 6 * * 1" # weekly, Monday 06:00 UTC

permissions:
  contents: read

env:
  SLOTNOVA_ENV: preview

jobs:
  smoke:
    name: provider-smoke seam check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: provider-smoke
    env:
      # Marker proving this job's scoped environment/secrets are reachable.
      # Real provider credentials, when a Phase-1 adapter exists, will live
      # only in this job's `environment: provider-smoke` secrets context --
      # never in fast.yml or heavy.yml.
      PROVIDER_SMOKE_SEAM: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Provider-smoke seam check
        run: pnpm exec tsx tooling/provider-smoke/check-seam.ts
```

- [ ] **Step 6: Validate the workflow YAML parses**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && node -e "const yaml=require('node:fs').readFileSync('.github/workflows/provider-smoke.yml','utf8'); console.log('bytes:', yaml.length)"`

(A full schema check happens once pushed and GitHub parses it; this step is just a sanity read. If `js-yaml` or similar is available via a devDependency, prefer parsing with it instead — check `pnpm ls js-yaml` first and use it if present, otherwise the byte-count sanity check is sufficient.)

- [ ] **Step 7: Run the script directly to see its real local output**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && PROVIDER_SMOKE_SEAM=1 pnpm exec tsx tooling/provider-smoke/check-seam.ts`
Expected: prints the summary line, exit code 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add .github/workflows/provider-smoke.yml tooling/provider-smoke
git commit -m "feat(t086): add provider-smoke workflow and seam check"
```

---

## Task 9: T086 wrap-up — mark task complete

**Files:**
- Modify: `specs/001-platform-foundation-shell/tasks.md:838`

- [ ] **Step 1: Run all T086-related tests one more time**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/testing/src/msw tooling/provider-smoke`
Expected: PASS

- [ ] **Step 2: Check the T086 box**

Change `specs/001-platform-foundation-shell/tasks.md:838` from `- [ ] T086 ...` to `- [x] T086 ...`.

- [ ] **Step 3: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add specs/001-platform-foundation-shell/tasks.md
git commit -m "chore(t086): mark T086 complete"
```

---

## Task 10: Storybook visual-regression harness (T088) — build + screenshot script

**Files:**
- Create: `packages/ui/visual/run-visual-regression.ts`
- Create: `packages/ui/visual/__tests__/story-catalogue.test.ts`
- Modify: `packages/ui/package.json` (add `test:visual` script + `@playwright/test` devDependency)

**Interfaces:**
- Produces: `listStableStories(): StoryEntry[]` (enumerates the 9 existing `*.stories.tsx` files under `packages/ui/src/system-states/`) and a `test:visual` pnpm script that builds Storybook and runs Playwright screenshots against it.
- Consumes: nothing from Tasks 1–9 (independent slice).

- [ ] **Step 1: Write the failing test for story enumeration**

Create `packages/ui/visual/__tests__/story-catalogue.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { listStableStories } from "../run-visual-regression.js";

describe("listStableStories", () => {
  it("enumerates exactly the 9 existing system-state stories, no more", async () => {
    const stories = await listStableStories();
    expect(stories).toHaveLength(9);
    expect(stories.every((s) => s.filePath.includes("system-states"))).toBe(true);
  });

  it("each story entry has a stable storyId derived from its filename", async () => {
    const stories = await listStableStories();
    for (const story of stories) {
      expect(story.storyId).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/ui/visual/__tests__/story-catalogue.test.ts`
Expected: FAIL with "Cannot find module '../run-visual-regression.js'"

- [ ] **Step 3: Implement `listStableStories` in `run-visual-regression.ts`**

Create `packages/ui/visual/run-visual-regression.ts`:

```typescript
/**
 * Targeted visual regression for Slotnova's stable Storybook primitives
 * (task T088). Scope is deliberately narrow: exactly the stable
 * system-state presentation stories that exist today under
 * packages/ui/src/system-states/ -- no product screens, no full-route
 * snapshots. See docs/standards/ci-quality-gates.md and
 * specs/001-platform-foundation-shell/tasks.md T088.
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface StoryEntry {
  filePath: string;
  storyId: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const SYSTEM_STATES_DIR = join(here, "..", "src", "system-states");

function storyIdFromFilename(fileName: string): string {
  return fileName.replace(/\.stories\.tsx$/, "");
}

/** Enumerate the stable stories this harness screenshots (Light + Dark). */
export async function listStableStories(): Promise<StoryEntry[]> {
  const files = await readdir(SYSTEM_STATES_DIR);
  return files
    .filter((f) => f.endsWith(".stories.tsx"))
    .sort()
    .map((f) => ({
      filePath: join(SYSTEM_STATES_DIR, f),
      storyId: storyIdFromFilename(f),
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run packages/ui/visual/__tests__/story-catalogue.test.ts`
Expected: PASS (2/2) — confirms exactly 9 stories exist today (per exploration ground truth); if this count is ever wrong, the test is the mechanical enforcement of T088's "targeted screenshots only" scope, since adding a new story requires deliberately updating the expected count here too. Actually: since a future PR *should* be free to add more stable stories without this test blocking them, do NOT hard-code `9` as a permanent ceiling in product code — this specific test asserting `toHaveLength(9)` is a snapshot of today's ground truth for this PR's own verification, acceptable here because T088 is scoped to exactly today's stories; a future PR extending stories will update this expectation, which is normal test maintenance, not scope creep.

- [ ] **Step 5: Add `@playwright/test` as a devDependency and a `test:visual` script to `packages/ui/package.json`**

Read `packages/ui/package.json` first (already read during exploration — reproduced above). Add to `devDependencies`: `"@playwright/test": "^1.57.0"` (match whatever version `apps/web`'s Playwright devDependency uses — check `apps/web/package.json` for the exact pinned version first and use that same version for consistency). Add to `scripts`: `"test:visual": "playwright test --config visual/playwright.visual.config.ts"`.

- [ ] **Step 6: Run `pnpm install` to pick up the new devDependency**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add packages/ui/visual/run-visual-regression.ts packages/ui/visual/__tests__/story-catalogue.test.ts packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(t088): enumerate stable stories for visual regression"
```

---

## Task 11: Playwright visual-regression config + Light/Dark screenshot spec

**Files:**
- Create: `packages/ui/visual/playwright.visual.config.ts`
- Create: `packages/ui/visual/screenshots.spec.ts`
- Modify: `packages/ui/.storybook/main.ts` (only if `staticDirs`/build output path needs adjusting — read current config first; likely no change needed since `build-storybook` already works via the existing script)

**Interfaces:**
- Consumes: `listStableStories` from Task 10.
- Produces: baseline screenshots committed under `packages/ui/visual/screenshots.spec.ts-snapshots/` (Playwright's default convention for the config's `testDir`).

- [ ] **Step 1: Build Storybook once locally to get a real static output to point Playwright at**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm --filter @slotnova/ui build-storybook`
Expected: succeeds, produces `packages/ui/storybook-static/`. Note the exact output directory name from the command's own log output (Storybook's default is `storybook-static`) and use that exact path in the next step.

- [ ] **Step 2: Write `playwright.visual.config.ts`**

Create `packages/ui/visual/playwright.visual.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Targeted visual regression (task T088): stable Storybook system-state
 * stories only, Light + Dark, fixed viewport. Not the product E2E suite --
 * see apps/web/playwright.config.ts for that.
 */
export default defineConfig({
  testDir: "./",
  testMatch: "screenshots.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:6008",
    viewport: { width: 1024, height: 768 },
    colorScheme: "light",
    // Deterministic screenshots: no animation-driven flake.
    // (Playwright disables CSS animations/transitions automatically for
    // toHaveScreenshot when this option is not overridden per-call.)
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 },
  },
  webServer: {
    command: "pnpm exec http-server storybook-static -p 6008 --silent",
    url: "http://127.0.0.1:6008",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 3: Check whether `http-server` is already a devDependency anywhere in the repo; add it to `packages/ui/package.json` if not**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && grep -r "http-server" package.json packages/*/package.json apps/*/package.json`

If absent, add `"http-server": "^14.1.1"` to `packages/ui/package.json` devDependencies and run `pnpm install` again.

- [ ] **Step 4: Write `screenshots.spec.ts` using `listStableStories` and Light/Dark**

Create `packages/ui/visual/screenshots.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

import { listStableStories } from "./run-visual-regression.js";

const THEMES = ["light", "dark"] as const;

test.describe("stable Storybook system-state stories — visual regression", () => {
  for (const theme of THEMES) {
    test.describe(`${theme} theme`, () => {
      test(`captures all stable stories in ${theme}`, async ({ page }) => {
        const stories = await listStableStories();
        for (const story of stories) {
          await page.goto(
            `/iframe.html?id=system-states-${story.storyId}--default&globals=theme:${theme}`,
          );
          await page.waitForLoadState("networkidle");
          await expect(page).toHaveScreenshot(`${story.storyId}-${theme}.png`, {
            fullPage: true,
          });
        }
      });
    });
  }
});
```

**Note for the implementer:** the exact Storybook story-id URL scheme (`system-states-<name>--default`) and the `theme` global's name depend on `packages/ui/.storybook/preview.tsx`'s actual theme-switching setup. Read `packages/ui/.storybook/preview.tsx` before writing this file and adjust the URL query params / story-id derivation to match what's actually configured there (e.g. the addon that provides Light/Dark toggling, and each story's actual exported name — confirm via `packages/ui/src/system-states/*.stories.tsx`'s `export const Default` or equivalent). This step is intentionally the one requiring a final on-the-ground check before the spec above is taken as literal, since preview.tsx wasn't read in full during exploration.

- [ ] **Step 5: Generate the baseline screenshots**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf/packages/ui && pnpm exec playwright install --with-deps chromium && pnpm test:visual --update-snapshots`
Expected: succeeds, creates `packages/ui/visual/screenshots.spec.ts-snapshots/*.png` (18 files: 9 stories × 2 themes).

- [ ] **Step 6: Re-run without `--update-snapshots` to prove the baseline is stable/deterministic**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf/packages/ui && pnpm test:visual`
Expected: PASS, 0 diffs — proves determinism (no arbitrary sleeps, fixed viewport, disabled animations). If flaky, investigate font-loading timing (add `document.fonts.ready` wait) or an animated system-state story (verify the reduced-motion CSS is actually active in the Storybook preview context — check `packages/ui/.storybook/preview.tsx` for whether it sets `prefers-reduced-motion` or applies `apps/web/src/styles/reduced-motion.css`'s equivalent token; add the missing wiring if it's absent).

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add packages/ui/visual packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(t088): targeted Playwright visual regression for system-state stories"
```

---

## Task 12: T088 wrap-up — mark task complete

**Files:**
- Modify: `specs/001-platform-foundation-shell/tasks.md:852`

- [ ] **Step 1: Run the full visual regression suite one more time**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf/packages/ui && pnpm test:visual`
Expected: PASS

- [ ] **Step 2: Check the T088 box**

Change `specs/001-platform-foundation-shell/tasks.md:852` from `- [ ] T088 ...` to `- [x] T088 ...`.

- [ ] **Step 3: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add specs/001-platform-foundation-shell/tasks.md
git commit -m "chore(t088): mark T088 complete"
```

---

## Task 13: Complete the heavy lane — fold in axe + visual regression + security reference

**Files:**
- Modify: `.github/workflows/heavy.yml`

**Interfaces:**
- Consumes: Task 8's provider-smoke separation (heavy.yml must NOT gain provider secrets), Task 11's `packages/ui` `test:visual` script.

- [ ] **Step 1: Add a new `browser-and-visual` job to `heavy.yml`, after the existing `migration-proof` job**

This job composes rather than duplicates: it references what `e2e.yml` already runs (real-PG integration + Playwright journeys) is **kept in `e2e.yml` as its own required check** (already required per the issue's evidence: "PR #51 ... passed all four PR workflows: fast, e2e, heavy, security" — so `e2e.yml` stays a separate required workflow rather than being merged away, avoiding duplicated real-PG/Playwright pipelines). `heavy.yml` gains the genuinely new T087 obligations not covered elsewhere: axe accessibility checks on the Playwright journeys, and the T088 visual regression job. Add after `migration-proof:` (before `release-migrations:`):

```yaml
  visual-regression:
    name: targeted visual regression (Storybook, Light/Dark)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @slotnova/ui build-storybook
      - run: pnpm --filter @slotnova/ui exec playwright install --with-deps chromium
      - name: Targeted Storybook visual regression (Light + Dark)
        run: pnpm --filter @slotnova/ui test:visual
  accessibility:
    name: axe accessibility checks (Playwright journeys)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm --filter @slotnova/web exec playwright install --with-deps chromium
      - name: Playwright journeys with axe assertions
        run: pnpm e2e
        env:
          SLOTNOVA_E2E_AXE: "1"
  security-scan-reference:
    name: security scans (see security.yml)
    runs-on: ubuntu-latest
    timeout-minutes: 1
    steps:
      - name: Security scanning runs in the separate required security.yml workflow
        run: |
          echo "Dependency vulnerability, secret, and static-analysis scanning" \
               "run in the separate required 'security' workflow (security.yml)," \
               "not duplicated here, per T087's 'do not duplicate work" \
               "gratuitously' acceptance criterion."
```

**Note for the implementer:** the `accessibility` job's `SLOTNOVA_E2E_AXE: "1"` env var assumes an axe assertion hook exists or will be added in the Playwright E2E suite (`apps/web/e2e/`). Check `apps/web/e2e/` for any existing `@axe-core/playwright` usage before writing this job — if none exists, this task must first add a minimal axe assertion (using `@axe-core/playwright`, a common, already-listed-in-ADR-006-scope pattern per `docs/testing/strategy.md` §9 "Automated axe checks are required") into at least the existing Playwright journeys, as a small addition, not a new test suite; add `@axe-core/playwright` as a devDependency to `apps/web/package.json` if absent, and wire a single `expect(await new AxeBuilder({ page }).analyze()).toHaveNoViolations()`-style assertion (exact API per `@axe-core/playwright`'s README) into the existing smoke journey. This is real, required T087 scope ("a11y checks") — do not skip it by leaving the env var unused.

- [ ] **Step 2: If Task 1's step above required adding real axe assertions, write them now (TDD: confirm the journey currently has no axe check, add the assertion, run locally with Docker/Playwright available)**

Run (after implementing): `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm e2e`
Expected: PASS, including the new axe assertion, if Playwright/Docker infra is available locally; otherwise defer to CI as the authoritative run and note this in the final report.

- [ ] **Step 3: Validate the modified `heavy.yml` YAML is well-formed**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && node -e "const fs=require('node:fs'); const c=fs.readFileSync('.github/workflows/heavy.yml','utf8'); console.log('bytes:', c.length)"`

- [ ] **Step 4: Update `heavy.yml`'s header comment to reflect T087 completion**

Change line 1 of `heavy.yml` from:
```yaml
# T074 foundation only; not full T087 completion. Never deploys the application.
```
to:
```yaml
# T087 complete: migration proof (T074 foundation) + targeted visual
# regression (T088) + axe accessibility checks. Real-PostgreSQL integration
# and Playwright journeys 6/7 remain in the separate required e2e.yml
# workflow; security scans remain in the separate required security.yml
# workflow -- composed as distinct required checks rather than duplicated
# here. Never deploys the application.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add .github/workflows/heavy.yml apps/web/package.json apps/web/e2e pnpm-lock.yaml
git commit -m "feat(t087): complete heavy lane with visual regression, axe, security reference"
```

---

## Task 14: T087 wrap-up — mark task complete

**Files:**
- Modify: `specs/001-platform-foundation-shell/tasks.md:846`

- [ ] **Step 1: Check the T087 box**

Change `specs/001-platform-foundation-shell/tasks.md:846` from `- [ ] T087 ...` to `- [x] T087 ...`.

- [ ] **Step 2: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add specs/001-platform-foundation-shell/tasks.md
git commit -m "chore(t087): mark T087 complete"
```

---

## Task 15: T089 — measured performance baselines document

**Files:**
- Create: `docs/runbooks/perf-baselines.md`

**Interfaces:**
- Consumes: nothing (pure measurement).

- [ ] **Step 1: Measure install time**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && rm -rf node_modules && time pnpm install --frozen-lockfile 2>&1 | tail -20`
Record the real/user/sys time from the `time` output verbatim.

- [ ] **Step 2: Measure build time**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && time pnpm build 2>&1 | tail -20`
Record verbatim.

- [ ] **Step 3: Measure unit/property test time**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && time pnpm test 2>&1 | tail -20`
Record verbatim.

- [ ] **Step 4: Measure route bundle sizes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && du -sh apps/web/dist/assets/*.js 2>&1 | sort -rh`
(If `apps/web/dist` doesn't exist because `pnpm build` outputs elsewhere, first run `pnpm --filter @slotnova/web build` and locate its actual output directory before measuring.) Record verbatim.

- [ ] **Step 5: Measure the T085 dependency-cruiser check time and T086 network-guard test time (new-in-this-PR mechanisms)**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && time pnpm lint:boundaries 2>&1 | tail -5`
Record verbatim.

- [ ] **Step 6: Write `docs/runbooks/perf-baselines.md` with the real measured numbers from Steps 1–5**

Create `docs/runbooks/perf-baselines.md` with this structure (fill in the `<measured: ...>` placeholders with the actual numbers captured above — do not invent numbers; if a measurement could not be taken locally, state that explicitly and why, e.g. "not measured locally — Docker unavailable in this environment; heavy-lane duration below is the only value that can only come from an actual GitHub Actions run"):

```markdown
# Performance Baselines (Phase 1, T089)

Recorded from a clean checkout of `feat/pr-19-hardening-ci-visual-perf` at
commit `<measured: git rev-parse HEAD>`, Node `24.20.0`, on
`<measured: uname -a summary>`. These are local developer-machine
measurements, not CI-machine measurements — CI timing (recorded separately
below once available) is the authoritative number for the heavy-lane budget
decision.

## Install

`<measured: real time from Step 1>`

## Build (`pnpm build`, full Turborepo pipeline)

`<measured: real time from Step 2>`

## Unit/property tests (`pnpm test`)

`<measured: real time from Step 3>`

## Route bundle sizes (`apps/web` production build)

`<measured: du -sh output from Step 4, one line per asset>`

## Architecture boundary check (`pnpm lint:boundaries`, T085)

`<measured: real time from Step 5>`

## Heavy-lane duration baseline

**Pending.** Per the T089 acceptance criteria, the heavy-lane duration
baseline can only be recorded from an actual completed run of the finished
`heavy.yml` workflow in GitHub Actions — not simulated locally, since it
includes GitHub-hosted-runner characteristics (network, cache warmth,
concurrent job scheduling across `migration-checklist`, `migration-proof`,
`visual-regression`, `accessibility`) that a local run cannot reproduce.
This section will be filled in once this PR's heavy workflow run completes,
and the recorded number becomes evidence for the founder-approval decision
below.

## Founder-agreed heavy-lane pre-merge time budget

**PENDING FOUNDER APPROVAL.** Do not treat any number here as agreed until
the founder has reviewed the actual observed heavy-lane duration (above)
from a completed GitHub Actions run and explicitly approved a budget. Once
approved, the agreed value is recorded here AND in
`docs/standards/ci-quality-gates.md`'s "Performance" section, and
`tooling/perf/check-heavy-budget.ts` (T089 enforcement mechanism, added in
this PR) is pointed at that value.

Recommendation offered for founder consideration only, not a decision:
`<measured: observed heavy-lane duration once available>` plus reasonable
headroom (see this PR's final report to the founder).
```

- [ ] **Step 7: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add docs/runbooks/perf-baselines.md
git commit -m "docs(t089): record measured performance baselines"
```

---

## Task 16: T089 — budget-check enforcement mechanism (value left pending)

**Files:**
- Create: `tooling/perf/check-heavy-budget.ts`
- Create: `tooling/perf/__tests__/check-heavy-budget.test.ts`
- Modify: `docs/standards/ci-quality-gates.md` (add the pending-placeholder budget line to the existing "Performance" section)

**Interfaces:**
- Produces: `checkHeavyLaneBudget(observedSeconds: number, budgetSeconds: number | null): { withinBudget: boolean | null; message: string }` — returns `null`/an explanatory message when `budgetSeconds` is `null` (no founder-approved budget recorded yet), so the mechanism is provably inert until a real number is supplied, never silently passing or failing.

- [ ] **Step 1: Write the failing test**

Create `tooling/perf/__tests__/check-heavy-budget.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { checkHeavyLaneBudget } from "../check-heavy-budget.js";

describe("checkHeavyLaneBudget", () => {
  it("returns withinBudget: null and an explanatory message when no budget is recorded yet", () => {
    const result = checkHeavyLaneBudget(600, null);
    expect(result.withinBudget).toBeNull();
    expect(result.message).toMatch(/no founder-approved heavy-lane budget recorded yet/i);
  });

  it("returns withinBudget: true when observed duration is within an approved budget", () => {
    const result = checkHeavyLaneBudget(500, 900);
    expect(result.withinBudget).toBe(true);
  });

  it("returns withinBudget: false when observed duration exceeds an approved budget", () => {
    const result = checkHeavyLaneBudget(1200, 900);
    expect(result.withinBudget).toBe(false);
    expect(result.message).toMatch(/exceeds/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/perf/__tests__/check-heavy-budget.test.ts`
Expected: FAIL with "Cannot find module '../check-heavy-budget.js'"

- [ ] **Step 3: Implement `check-heavy-budget.ts`**

Create `tooling/perf/check-heavy-budget.ts`:

```typescript
/**
 * Heavy-lane pre-merge time budget check (task T089).
 *
 * The mechanism is complete and ready to enforce, but the budget VALUE is
 * deliberately not chosen here -- per the issue's founder gate, no
 * heavy-lane budget may be silently selected. `budgetSeconds` is `null`
 * until the founder approves a number from an actual observed GitHub
 * Actions heavy-lane run (see docs/runbooks/perf-baselines.md), at which
 * point the approved value is recorded in
 * docs/standards/ci-quality-gates.md and this script is wired into CI to
 * enforce it.
 */

export interface HeavyLaneBudgetResult {
  withinBudget: boolean | null;
  message: string;
}

export function checkHeavyLaneBudget(
  observedSeconds: number,
  budgetSeconds: number | null,
): HeavyLaneBudgetResult {
  if (budgetSeconds === null) {
    return {
      withinBudget: null,
      message:
        "no founder-approved heavy-lane budget recorded yet " +
        "(docs/standards/ci-quality-gates.md) -- this check is inert until one is set.",
    };
  }
  const withinBudget = observedSeconds <= budgetSeconds;
  return {
    withinBudget,
    message: withinBudget
      ? `observed heavy-lane duration ${observedSeconds}s is within the ${budgetSeconds}s budget.`
      : `observed heavy-lane duration ${observedSeconds}s exceeds the ${budgetSeconds}s budget.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm vitest run tooling/perf/__tests__/check-heavy-budget.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Add the pending-placeholder line to `docs/standards/ci-quality-gates.md`'s "Performance" section**

Modify the existing "Performance" section (last section of the file) to add, after the existing paragraph:

```markdown

## Heavy-lane pre-merge time budget (T089)

**Status: pending founder approval.** No budget value is recorded here yet.
Per the PR-19/T089 founder gate, a budget must not be silently selected —
it is set only after the founder reviews an actual observed heavy-lane
duration from a completed GitHub Actions run and explicitly approves a
number. `tooling/perf/check-heavy-budget.ts` implements the enforcement
mechanism and is ready to wire into `heavy.yml` once a value lands here.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add tooling/perf docs/standards/ci-quality-gates.md
git commit -m "feat(t089): add heavy-lane budget-check mechanism (value pending founder approval)"
```

---

## Task 17: `.slotnova/CURRENT.md` refresh

**Files:**
- Modify: `.slotnova/CURRENT.md`

- [ ] **Step 1: Rewrite the file's "Current main" and "Current implementation state" sections**

Replace the content of `.slotnova/CURRENT.md` (keep the "Authority note", "Workflow-efficiency setup", and "Governance" sections unchanged) — update only:

```markdown
## Current main

`33aa0a6c98b7dd20e295daa1bda38a4eddd0cf41` — merged PR #51 — PR-18 / T076-T078 observability deepening.

## Current implementation state

PR-18 is merged and complete.

Active: PR-19 — T085-T089 architecture tightening, provider-smoke CI, heavy
lane completion, visual regression, performance baselines (issue #52,
branch `feat/pr-19-hardening-ci-visual-perf`). T085/T086/T087/T088
implemented; T089 measurement/enforcement mechanism implemented, budget
value pending founder approval per the founder gate.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
git add .slotnova/CURRENT.md
git commit -m "docs: refresh .slotnova/CURRENT.md for PR-19"
```

---

## Task 18: Final local verification, push, and PR

**Files:** none (verification + delivery only).

- [ ] **Step 1: Run `pnpm verify:fast`**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm verify:fast`
Expected: `VERIFY FAST: PASS`. If any step fails, fix root cause (do not weaken any check) and re-run.

- [ ] **Step 2: Run `pnpm verify:integration` (requires Docker/Podman for Testcontainers)**

Run: `export PATH="/Users/olaniyiaborisade/.nvm/versions/node/v24.20.0/bin:$PATH" && cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && pnpm verify:integration`
Expected: `VERIFY INTEGRATION: PASS`. If Docker is unavailable in this environment, note it explicitly in the final report and rely on the `e2e`/`heavy` GitHub Actions runs as the authoritative check.

- [ ] **Step 3: Run `git diff --check` for whitespace errors**

Run: `cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && git diff origin/main --check`
Expected: no output (clean).

- [ ] **Step 4: Inspect the full diff for scope discipline**

Run: `cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && git diff origin/main --stat`

Confirm: no product-domain files touched, no T090/T091 files touched (only the narrow `.slotnova/CURRENT.md`), no weakened existing rule/test, no provider credentials committed, no accidental production dependency on `test-harness`, no unnecessary dependency additions beyond what Tasks 10/11/13 required (`@playwright/test`, `http-server`, possibly `@axe-core/playwright`).

- [ ] **Step 5: Push the branch**

Run: `cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && git push -u origin feat/pr-19-hardening-ci-visual-perf`

- [ ] **Step 6: Open the PR**

Run:
```bash
cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf
gh pr create --repo Nejo12/slotnova \
  --base main \
  --head feat/pr-19-hardening-ci-visual-perf \
  --title "PR-19: architecture tightening, provider-smoke CI, heavy lane, visual regression & performance baseline (T085-T089)" \
  --body "$(cat <<'EOF'
## Summary

Implements T085-T089 (bounded slice) from `specs/001-platform-foundation-shell/tasks.md`, per issue #52.

- T085: three additive dependency-cruiser rules (per-module public-entry for `audit`/`identity`, `packages/contracts` generated-only import direction, `test-harness` production-graph exclusion) with fixtures.
- T086: global HTTP(S)/fetch network-egress denylist (MSW-mandatory + socket-level guard) wired into fast + heavy Vitest configs; new `provider-smoke.yml` (manual + scheduled, scoped secrets, truthful no-provider-adapter-yet seam check).
- T087: `heavy.yml` completed with visual regression, axe accessibility checks, and a security-scan reference — composed with the existing required `e2e.yml`/`security.yml` rather than duplicated.
- T088: targeted Playwright visual regression against the 9 existing Storybook system-state stories, Light + Dark, deterministic (fixed viewport, disabled animations).
- T089: measured performance baselines recorded in `docs/runbooks/perf-baselines.md`; budget-check enforcement mechanism implemented; **heavy-lane time budget value left pending founder approval**, per the founder gate — not recorded as agreed.

`.slotnova/CURRENT.md` refreshed narrowly (PR-18 merged, PR-19 active).

## Out of scope (confirmed)

No product-domain behavior. No T090/T091 work beyond the narrow CURRENT.md refresh. No k6/production load budgets. No provider credentials committed. No merge/auto-merge — founder merges manually.

## Test plan

- [x] `pnpm verify:fast`
- [ ] `pnpm verify:integration` (see PR description update / final report for local Docker availability)
- [x] `tooling/dependency-cruiser/__tests__/rules.test.ts` — all fixtures including 3 new T085 rules
- [x] `packages/testing/src/msw/__tests__/deny-network*.test.ts` — proves unmocked provider calls blocked
- [x] `packages/ui` `test:visual` — 18 deterministic baseline screenshots (9 stories × Light/Dark)
- [ ] Heavy-lane workflow run in GitHub Actions (authoritative timing evidence for the pending T089 budget decision)

Closes #52
EOF
)"
```

- [ ] **Step 7: Record the PR number and exact head SHA for the final report**

Run: `cd /Users/olaniyiaborisade/Codes/slotnova-pr-19-hardening-ci-visual-perf && gh pr view --repo Nejo12/slotnova --json number,url && git rev-parse HEAD`

**STOP HERE.** Do not merge. Do not enable auto-merge. Report back to the user: PR number/URL, exact head SHA, base SHA (`33aa0a6c98b7dd20e295daa1bda38a4eddd0cf41`), changed files summary, local test results, measured T089 baseline evidence, whether Docker/Playwright-dependent local checks ran or were deferred to CI, and the explicit unresolved decision (founder-approved heavy-lane budget number).
