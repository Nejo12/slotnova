/**
 * Branded identifiers for the `identity` module (data-model.md "opaque/branded"
 * identifiers). A branded type is a plain `string` at runtime — these `as*`
 * helpers are cheap casts, not validation; the UUID shape itself is enforced by
 * the `uuid` column type at the database boundary (T031).
 *
 * Branding exists so a `WorkspaceId` can never be passed where a `UserId` is
 * expected, even though both are strings underneath.
 */
declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type UserId = Brand<string, "UserId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type LocationId = Brand<string, "LocationId">;
export type MembershipId = Brand<string, "MembershipId">;
export type InvitationId = Brand<string, "InvitationId">;
export type SessionId = Brand<string, "SessionId">;

export const asUserId = (value: string): UserId => value as UserId;
export const asWorkspaceId = (value: string): WorkspaceId => value as WorkspaceId;
export const asLocationId = (value: string): LocationId => value as LocationId;
export const asMembershipId = (value: string): MembershipId => value as MembershipId;
export const asInvitationId = (value: string): InvitationId => value as InvitationId;
export const asSessionId = (value: string): SessionId => value as SessionId;
