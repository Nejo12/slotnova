/**
 * Scheduling capability strings (`contracts/scheduling.contract.md`, issue
 * #66).
 *
 * Owned by `scheduling`, not by `identity`'s `capabilities.ts` — that file is
 * explicitly scoped to "Phase-1 protected-foundation-action" capabilities, and
 * a module's own protected actions are its own vocabulary. `identity` only
 * needs to *compare* the string (`authorize()` takes a plain
 * `requiredCapability: string`), so nothing here creates a dependency in that
 * direction. Same shape as `catalog/domain/policy/capabilities.ts`.
 *
 * Deliberately two, exactly as the contract names them: `scheduling:read`
 * gates `GET /availability-patterns` and `POST /availability/resolve` (a pure
 * computation over existing data, so a read capability is the correct gate),
 * `scheduling:manage` gates both create endpoints.
 *
 * NOTE (Founder decision, deliberately NOT made in PR-04): which membership
 * roles receive these capabilities by default is a product-policy question no
 * accepted artifact answers, so `identity`'s `DEFAULT_ROLE_PERMISSIONS` is
 * left untouched — exactly as PR-02 left the identical `catalog:read`/
 * `catalog:manage` mapping open. Enforcement is complete and
 * server-authoritative; granting is done by writing the capability onto a
 * membership's `permissions`. Inventing a role mapping would be product
 * policy this PR was not asked to decide.
 */
export const SCHEDULING_READ = "scheduling:read";
export const SCHEDULING_MANAGE = "scheduling:manage";

export const SCHEDULING_CAPABILITIES = [SCHEDULING_READ, SCHEDULING_MANAGE] as const;

export type SchedulingCapability = (typeof SCHEDULING_CAPABILITIES)[number];
