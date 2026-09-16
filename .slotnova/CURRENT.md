# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`2a0dddb7d860debb6f8abe831b6bed439813d617` — merged PR #53 — PR-19 / T085-T089
architecture tightening, provider-smoke CI, heavy lane, visual regression,
performance baselines. Founder-approved 180s heavy-lane budget recorded and
actively enforced in CI (`budget-check` job, `heavy.yml`).

## Current implementation state

PR-19 is merged and complete.

Under review: PR-20 — T090-T091 final Phase-1 validation, documentation
reconciliation and exit (issue #54, PR #55, branch `feat/pr-20-phase-1-exit`).
Full quickstart/SC-001...SC-018 validation executed; all 18 criteria
demonstrably PASS — evidence matrix at `docs/phase-1-exit.md`. All six
Phase-1 exit decision records (`docs/decisions/0001`-`0006`) exist and are
founder-approved. T079-T091 all checked complete in `tasks.md`.

**Phase 1 is validated and exit-ready, but is NOT formally exited until the
founder merges PR #55.** This snapshot records readiness, not completion —
do not treat Phase 1 as exited, and do not begin Phase 2 product work,
until PR #55 is actually merged to `main`.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
