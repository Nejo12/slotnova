/**
 * Matches an adapter's verified identity to a Slotnova `User` row (T036/T038,
 * shared by every credential adapter -- this is deliberately adapter-agnostic
 * so T039's parity test sees identical resolution behavior regardless of
 * which adapter verified the credential).
 *
 * Phase 1 has no self-signup/provisioning flow (users arrive only via
 * invitation acceptance or are pre-seeded) -- this never creates a user, only
 * matches an existing one and, the first time, links the adapter's
 * `externalRef` onto it.
 */
import type {
  UserRecord,
  UsersRepository,
} from "../../infrastructure/repositories/users.repository.js";
import type { CredentialAdapterResult } from "../../infrastructure/credential-adapter/port.js";

export async function resolveVerifiedUser(
  users: UsersRepository,
  verified: CredentialAdapterResult,
): Promise<UserRecord | null> {
  const byExternalRef = await users.findByExternalRef(verified.externalRef);
  if (byExternalRef) return byExternalRef;

  const byEmail = await users.findByEmail(verified.email);
  if (!byEmail) return null;

  // A different external identity is already linked to this email -- fail
  // closed rather than silently re-link (an existing link was not respected
  // by the first lookup above, so it must be a DIFFERENT ref).
  if (byEmail.externalRef !== null) return null;

  await users.linkExternalRef(byEmail.id, verified.externalRef);
  return { ...byEmail, externalRef: verified.externalRef };
}
