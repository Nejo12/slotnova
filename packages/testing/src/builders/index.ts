/**
 * `@slotnova/testing/builders` — valid-by-default test-data builders (task T017).
 *
 * Every builder returns a fresh object (nested values included) on each call,
 * with deterministic defaults, and takes one optional override (a shallow patch
 * or a `(defaults) => value` function). There is no shared mutable fixture
 * state.
 *
 * These are **test-data shapes only**: no production domain model, no database
 * schema, and no product entities (booking / recovery / payment / service /
 * staff). Product-entity builders arrive with their own phases.
 */

export { applyOverride, type Override } from "./override.js";
export { TEST_EPOCH_ISO, testId, testTimestamp } from "./ids.js";

export { buildWorkspace, type WorkspaceShape, type WorkspaceSettingsShape } from "./workspace.js";
export { buildUser, type UserShape } from "./user.js";
export { buildMembership, type MembershipRole, type MembershipShape } from "./membership.js";
export { buildSession, type SessionShape } from "./session.js";
export { buildInvitation, type InvitationShape, type InvitationStatus } from "./invitation.js";

export {
  buildWorkspaceScenario,
  type WorkspaceScenario,
  type WorkspaceScenarioOverrides,
} from "./scenario.js";
