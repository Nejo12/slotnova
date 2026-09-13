/**
 * Branded identifier for the `audit` module (data-model.md "opaque/branded"
 * identifiers). See `identity/domain/ids.ts` for the same pattern — not
 * shared/imported across modules, since a generic `Brand<>` helper this small
 * does not clear the rule-of-three bar for extraction (constitution VI).
 */
declare const brand: unique symbol;

export type AuditRecordId = string & { readonly [brand]: "AuditRecordId" };

export const asAuditRecordId = (value: string): AuditRecordId => value as AuditRecordId;
