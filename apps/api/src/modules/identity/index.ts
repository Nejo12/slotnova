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
 * (T034), the credential adapter and session service (T035/T036), and
 * authorization policy (T041) are later PRs.
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
