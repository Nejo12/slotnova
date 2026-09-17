/**
 * Catalog capability strings (`contracts/catalog.contract.md`, spec.md
 * FR-002: "every Catalog mutation MUST require an explicit capability").
 *
 * Owned by `catalog`, not by `identity`'s `capabilities.ts` — that file is
 * explicitly scoped to "Phase-1 protected-foundation-action" capabilities,
 * and a module's own protected actions are its own vocabulary. `identity`
 * only needs to *compare* the string (`authorize()` takes a plain
 * `requiredCapability: string`), so nothing about this creates a dependency
 * in that direction.
 *
 * Deliberately two, exactly as the contract names them — read and manage.
 * No `catalog:delete` (there is no delete endpoint; deactivation is an
 * ordinary `catalog:manage` update) and no per-entity split.
 *
 * NOTE (Founder decision, deliberately NOT made in PR-02): which membership
 * roles receive these capabilities by default is a product-policy question
 * the accepted Phase-2 planning package does not answer, so
 * `identity`'s `DEFAULT_ROLE_PERMISSIONS` is left untouched here. Enforcement
 * is complete and server-authoritative; granting is done by writing the
 * capability onto a membership's `permissions`. Inventing a role mapping
 * would be behavior this PR was not asked to decide.
 */
export const CATALOG_READ = "catalog:read";
export const CATALOG_MANAGE = "catalog:manage";

export const CATALOG_CAPABILITIES = [CATALOG_READ, CATALOG_MANAGE] as const;

export type CatalogCapability = (typeof CATALOG_CAPABILITIES)[number];
