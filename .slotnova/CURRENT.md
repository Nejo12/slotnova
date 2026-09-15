# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`c05b54aed352a97e309bb68b263ef3b9d92c22c1` — merged PR #49 — PR-17 / T072-T075.

## Current implementation state

PR-17 is merged and complete.

Next planned product work: PR-18 — T076-T078 observability deepening.
PR-18 may now begin from verified current main.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
