/**
 * `identity` module public entry point — ports/types only (T029/T030).
 *
 * Other modules that need to reference an identity concept (for example
 * `audit`, which records a `workspaceId`/`actorUserId` against actions taken
 * in identity — data-model.md module-ownership: "cross-module needs go through
 * application ports") import from here, never from
 * `identity/infrastructure/**` (enforced by
 * `tooling/dependency-cruiser/.dependency-cruiser.cjs`
 * `no-cross-module-internals`).
 *
 * No repository, service, or schema table is exported here. Repositories
 * (T034) and the credential adapter/session service (T035/T036) stay
 * module-internal; the authorization policy surface (T041) below is the
 * one exception, since other modules gating a route need `CapabilityGuard`
 * and `RequireCapability` directly.
 */
export {
  asInvitationId,
  asLocationId,
  asMembershipId,
  asSessionId,
  asUserId,
  asWorkspaceId,
  type Brand,
  type InvitationId,
  type LocationId,
  type MembershipId,
  type SessionId,
  type UserId,
  type WorkspaceId,
} from "./domain/ids.js";

export {
  InvalidTimeZoneError,
  assertValidIanaTimeZone,
  isValidIanaTimeZone,
} from "./domain/timezone.js";

export { authorize, type AuthorizationSubject } from "./domain/policy/authorize.js";
export {
  MEMBERS_INVITE,
  MEMBERS_MANAGE,
  PROTECTED_FOUNDATION_CAPABILITIES,
  type Capability,
} from "./domain/policy/capabilities.js";
export { CapabilityGuard } from "./domain/policy/capability.guard.js";
export { RequireCapability, REQUIRE_CAPABILITY_KEY } from "./domain/policy/require-capability.decorator.js";
