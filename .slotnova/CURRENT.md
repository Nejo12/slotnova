# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`33aa0a6c98b7dd20e295daa1bda38a4eddd0cf41` — merged PR #51 — PR-18 / T076-T078 observability deepening.

## Current implementation state

PR-18 is merged and complete.

Active: PR-19 — T085-T089 architecture tightening, provider-smoke CI, heavy
lane completion, visual regression, performance baselines (issue #52,
branch `feat/pr-19-hardening-ci-visual-perf`). T085/T086/T087/T088
implemented; T089 measurement/enforcement mechanism implemented, budget
value pending founder approval per the founder gate.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
