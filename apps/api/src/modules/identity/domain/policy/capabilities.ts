/**
 * Phase-1 protected-foundation-action capability strings (T041, ADR-009).
 * Deliberately the two capabilities the accepted contract already names
 * (`contracts/workspace-context.contract.md`'s `activeWorkspace.permissions`
 * example) -- Phase 1 defines no other protected foundation action, and
 * inventing more here would be behavior this PR does not implement
 * (constitution I: "must not invent missing behavior").
 */
export const MEMBERS_INVITE = "members:invite";
export const MEMBERS_MANAGE = "members:manage";

export const PROTECTED_FOUNDATION_CAPABILITIES = [MEMBERS_INVITE, MEMBERS_MANAGE] as const;

export type Capability = (typeof PROTECTED_FOUNDATION_CAPABILITIES)[number];
