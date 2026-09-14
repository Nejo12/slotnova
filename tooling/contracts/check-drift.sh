#!/usr/bin/env bash
# T066 drift check (specs/001-platform-foundation-shell/tasks.md T066, FR-036,
# SC-008): proves the committed generated contract artifacts --
# apps/api/openapi/openapi.json, packages/contracts/src/generated/openapi.json,
# packages/contracts/src/generated/types.ts -- are exactly what T064/T065's
# own generators would produce right now from current source.
#
# Same shape as this repo's other "generated output must match committed
# output" gate (`pnpm install --frozen-lockfile`'s lockfile-drift check) --
# no bespoke diff tool, just: regenerate, then `git diff --exit-code` the
# known output paths. No repo precedent for a custom "generate then diff"
# script exists yet (checked: no other `git diff --exit-code` step in
# .github/ or tooling/), so this establishes the minimal version rather than
# following an existing pattern.
#
# Deliberately reuses T064/T065's own generation scripts (`openapi:generate`,
# `contracts:generate`) rather than reimplementing generation -- this task's
# instructions explicitly forbid modifying or duplicating that logic.
#
# Not wired as a `turbo.json` task: every existing turbo task in this repo is
# a per-workspace-package script that turbo fans out across packages (`build`,
# `tokens:generate`, `contracts:generate`, ...). This check spans two
# packages' generated output and ends in a root-level `git diff`, which does
# not fit that per-package model -- confirmed empirically (`turbo run
# <any-root-script> --filter=//` resolves to zero tasks in this repo's turbo
# config, the same as the existing `typecheck`/`lint`/`format:check` root
# scripts, which are likewise called directly in `fast.yml`, never through
# `turbo run`). This script follows that same established convention: a plain
# root `package.json` script (`contracts:check`), not a turbo task.
#
# Requires `apps/api` already built (`pnpm build`) -- `openapi:generate` runs
# the compiled `dist/scripts/generate-openapi.js`, per that script's own
# top-of-file comment on why it can't run via `tsx` directly. Run this step
# after the fast lane's `pnpm build`.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

GENERATED_PATHS=(
  "apps/api/openapi/openapi.json"
  "packages/contracts/src/generated/openapi.json"
  "packages/contracts/src/generated/types.ts"
)

echo "contracts:check -- regenerating contract artifacts to check for drift..."
pnpm --filter @slotnova/api openapi:generate
pnpm --filter @slotnova/contracts contracts:generate

if git diff --exit-code -- "${GENERATED_PATHS[@]}" >/dev/null; then
  echo "contracts:check -- OK: committed generated artifacts match current source."
  exit 0
fi

echo ""
echo "contracts:check -- FAILED"
echo ""
echo "One or more committed generated contract artifacts do not match what"
echo "their generators produce from current source. This usually means a Zod"
echo "schema (apps/api/src/modules/identity/http/*.schema.ts) or the OpenAPI"
echo "document changed without re-running generation, or a generated file was"
echo "hand-edited directly."
echo ""
echo "Diff:"
git diff -- "${GENERATED_PATHS[@]}"
echo ""
echo "Fix: run the following locally and commit the result:"
echo "  pnpm --filter @slotnova/api openapi:generate"
echo "  pnpm --filter @slotnova/contracts contracts:generate"
exit 1
