/**
 * Development credential adapter (T035, research R5): "verifies seeded
 * users" against an explicit, injected allowlist -- there is no password or
 * MFA infrastructure here, by design (R5, FR-033d). It is used for local
 * development and every automated test; a production deployment never wires
 * this adapter (that decision belongs to whatever composes the app, not to
 * this file).
 *
 * The dev sign-in credential shape is documented in
 * contracts/session.contract.md: `{ "seededUserEmail": "owner@example.test" }`.
 */
import type { CredentialAdapter, CredentialAdapterResult } from "./port.js";

export interface SeededDevUser {
  readonly email: string;
  readonly displayName: string;
}

export interface DevCredential {
  readonly seededUserEmail: string;
}

function isDevCredential(value: unknown): value is DevCredential {
  return (
    typeof value === "object" &&
    value !== null &&
    "seededUserEmail" in value &&
    typeof (value as { seededUserEmail: unknown }).seededUserEmail === "string" &&
    (value as { seededUserEmail: string }).seededUserEmail.trim() !== ""
  );
}

/** Stable prefix so a dev-verified external_ref can never collide with a real provider's. */
const DEV_EXTERNAL_REF_PREFIX = "dev-seed:";

export class DevCredentialAdapter implements CredentialAdapter {
  private readonly seededUsersByEmail: ReadonlyMap<string, SeededDevUser>;

  constructor(seededUsers: readonly SeededDevUser[]) {
    this.seededUsersByEmail = new Map(
      seededUsers.map((user) => [user.email.toLowerCase(), user] as const),
    );
  }

  async verify(credential: unknown): Promise<CredentialAdapterResult | null> {
    if (!isDevCredential(credential)) return null;
    const seeded = this.seededUsersByEmail.get(credential.seededUserEmail.toLowerCase());
    if (!seeded) return null;
    return {
      externalRef: `${DEV_EXTERNAL_REF_PREFIX}${seeded.email.toLowerCase()}`,
      email: seeded.email,
      displayName: seeded.displayName,
    };
  }
}
