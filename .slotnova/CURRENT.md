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

Active: PR-20 — T090-T091 final Phase-1 validation, documentation
reconciliation and exit (issue #54, branch `feat/pr-20-phase-1-exit`).
Full quickstart/SC-001...SC-018 validation executed; evidence matrix at
`docs/phase-1-exit.md`. **Phase 1 is NOT yet exited/merged.** One narrow
blocker remains: three Phase-1 exit decision records
(`docs/decisions/0002-version-pins.md`, `0005-production-identity-provider.md`,
`0006-csrf-mechanism.md`) were written in PR-20, consolidating already-shipped
evidence, but require founder review/approval before T080/T083/T084/T090/T091
can be checked complete and Phase 1 formally declared exited. Do not treat
Phase 1 as exited until the founder has reviewed those three records and
merged PR-20.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
