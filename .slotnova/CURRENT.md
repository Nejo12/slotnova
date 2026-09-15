# Slotnova Current State

## Authority note

Orientation snapshot only, not a source of truth. Authoritative order:
(1) current GitHub `main`/PR state, (2) Founder-approved decisions,
(3) accepted specs/tasks/ADRs. On conflict, trust the higher authority
and update this file.

## Current main

`ef56cbcc7e8a25d1493400baef1d5fc2fe67be35` — merged PR #47 / PR-16 / T068-T071.

## Current active implementation

PR-17, Issue #48. Branch: `feat/pr-17-deployment-env-security`.
Verified branch tip (`git ls-remote`): `1ae39acc2f12a35bd9a44fb13fa1f9f456d02a96`.
Open PR: #49.
Status: implementation committed and pushed; check PR/CI state live before
acting. Do NOT claim PR-17 merged.

## Workflow-efficiency setup

Branch: `chore/agent-workflow-efficiency`, head: `ced0afd9c0d484ec024ee2962fde168e960f180d`.
Completed: Step 1 (AGENTS.md execution discipline), Step 2 (low-noise
verification harness).

## Next planned product work

After PR-17 is Founder-merged: PR-18 — T076-T078 observability deepening.
Do not begin PR-18 before PR-17 merge is confirmed live.

## Governance

- Founder performs all merges manually; never enable auto-merge.
- Never assume local `main` is current; fetch/verify `origin/main`.
- Resume interrupted work before recreating it.
- Prefer focused local verification; GitHub Actions is the clean-room check.
