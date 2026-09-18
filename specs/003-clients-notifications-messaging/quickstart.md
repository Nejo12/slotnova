# Phase 3 Quickstart for Implementers

1. Start from current `main` in a fresh isolated worktree.
2. Read issue #85, parent #4, this package, `docs/phase-2-exit.md`, `docs/product-handoff.md`, AGENTS.md and relevant ADRs.
3. Implement only the tasks assigned to the current PR slice.
4. Keep Clients, Notifications and Messaging as separate modules with public/application ports.
5. Never deep-import another module's repository/schema.
6. Use runtime schemas first; regenerate OpenAPI/`@slotnova/contracts` only in contract-bearing PRs.
7. For tenant tables: RLS ENABLE + FORCE + real-PG isolation tests.
8. For Booking↔Client: additive nullable association; no fabricated backfill.
9. For notifications: existing outbox + pg-boss only; provider adapters remain fake/test seams unless Founder explicitly authorizes production integration.
10. For messaging: human conversation persistence only; no provider retry ownership.
11. Run the repository-prescribed fast/integration/e2e/heavy/security gates applicable to the slice.
12. Before requesting merge, inspect exact-head CI and stop. Founder merges manually.

## Required PR checklist

- Scope matches assigned task IDs.
- No out-of-phase Recovery/Marketing/Payments work.
- No `any`.
- No Tailwind.
- No cross-module schema/repository deep imports.
- Contracts generated from runtime schemas where applicable.
- RLS + FORCE proven for new tenant tables.
- Workspace-scoped TanStack Query keys.
- ≤400px mobile, Light/Dark, keyboard/focus/axe for UI slices.
- Exact-head CI green.
- Auto-merge disabled.
