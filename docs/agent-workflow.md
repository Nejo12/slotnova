# Slotnova Agent Workflow

## Roles

### ChatGPT

Use for project/status reconciliation, architecture/product planning,
GitHub/PR/CI inspection, preparing bounded implementation prompts,
interpreting failures, and deciding the next action. Not the merge authority.

### Claude Code

Default primary implementation agent when available. Recommended default:
Sonnet 5, medium effort, one agent only. Use for bounded implementation,
focused debugging, focused verification, commit + push. Do not use agent
swarms by default. Use High effort or stronger models only for genuinely
difficult concurrency, security, architecture, or deep cross-module
debugging work.

### Codex

Alternative implementation/debugging engine. Recommended: GPT-5.6 Terra for
normal implementation, GPT-5.6 Luna for mechanical/docs/Git chores,
Astra/Sol-class only for genuinely difficult reasoning. Do not use the most
expensive model for routine test execution or Git operations.

### GitHub Actions

Primary clean-room/full-suite verifier after push. Use CI for clean install,
full fast lane, integration, E2E, security scans, contract checks, heavy
lane. Agents should not routinely reproduce the same exhaustive clean-room
suite locally and then again in CI.

### Founder

Founder alone performs final PR merge. Never enable auto-merge.

## Normal implementation flow

1. Verify live origin/main.
2. Read AGENTS.md + `.slotnova/CURRENT.md` + linked issue/task.
3. Read only directly relevant implementation files.
4. Implement one bounded slice.
5. Run focused affected tests while developing.
6. Run `pnpm verify:fast` before delivery unless the task has an explicitly
   narrower gate.
7. Review diff.
8. Commit and push.
9. STOP.

Then: (10) GitHub Actions performs clean-room/full verification; (11)
ChatGPT or a short follow-up session inspects CI; (12) if CI fails, run a
narrowly scoped repair session for that failure only; (13) if green, report
READY FOR FOUNDER MERGE; (14) Founder merges manually.

## Integration-heavy changes

For DB/worker/E2E-sensitive changes, use `pnpm verify:integration` or
`pnpm verify:pr` only when the task genuinely requires full local
integration proof. Do not run `verify:pr` automatically for every
documentation/config/small code change.

## Conversation/context rules

- One fresh coding conversation per bounded task or repair.
- Do not carry multiple PR histories in one long coding-agent conversation.
- Prefer repository state over conversation memory; do not reread all
  ADRs/specs unless needed.
- Do not spawn multiple independent agents unless there is a specific
  review reason.
- Use `.slotnova/CURRENT.md` only as an orientation snapshot; verify live
  state before destructive or delivery actions.

## Interrupted session

On quota exhaustion/crash/timeout: inspect current worktree, identify
completed work/checks, preserve local changes, reuse still-valid
verification evidence, rerun only invalidated/incomplete checks, and
continue from the interruption point. Never blindly restart.

## CI failure flow

Inspect only the failing job/log, diagnose the smallest root cause, repair
on the same branch, run focused affected verification, push, let CI rerun,
stop when green. Do not rerun unrelated local suites.

## Model/usage discipline

Default to a mid-cost capable model; escalate model/effort only when
complexity justifies it. Avoid expensive models for waiting, polling,
formatting, docs, or routine Git. One agent by default. GitHub CI handles
deterministic exhaustive verification.

## Governance

- one bounded issue per PR; no unrelated refactors
- no direct commits to main; no auto-merge; Founder merges manually
- never weaken tests to make CI pass
- never discard dirty work without explicit Founder approval
