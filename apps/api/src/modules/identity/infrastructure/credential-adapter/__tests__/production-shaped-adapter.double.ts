/**
 * T039 -- a production-shaped `CredentialAdapter` TEST DOUBLE. Shaped like a
 * real external-provider adapter would be: it verifies an opaque bearer-like
 * token against a provider-side identity record that ALSO carries
 * provider-issued role claims -- exactly the shape research R5 describes for
 * a real vendor (WorkOS/Auth0/Clerk/Ory). This is test-only scaffolding, not
 * a real provider integration (out of scope, R5 remains deferred/conditional).
 *
 * The point of this double: {@link CredentialAdapterResult} has no
 * role/permission field at all, so `claimedRoles` below can never reach a
 * caller through the port's type -- this file exists to prove that at
 * runtime too (adapter-parity.int.test.ts), not just by type-checking.
 */
import type { CredentialAdapter, CredentialAdapterResult } from "../port.js";

export interface ProductionProviderIdentity {
  readonly providerUserId: string;
  readonly email: string;
  readonly displayName: string;
  /** Provider-issued role claims -- FR-027: "provider-supplied role or permission claims MUST NEVER be the authorization source of truth." Deliberately dropped by `verify`. */
  readonly claimedRoles: readonly string[];
}

export interface ProductionCredential {
  readonly token: string;
}

function isProductionCredential(value: unknown): value is ProductionCredential {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof (value as { token: unknown }).token === "string" &&
    (value as { token: string }).token.trim() !== ""
  );
}

const PROD_EXTERNAL_REF_PREFIX = "prod-provider:";

export class ProductionShapedCredentialAdapterDouble implements CredentialAdapter {
  private readonly identitiesByToken: ReadonlyMap<string, ProductionProviderIdentity>;

  constructor(identitiesByToken: ReadonlyMap<string, ProductionProviderIdentity>) {
    this.identitiesByToken = identitiesByToken;
  }

  async verify(credential: unknown): Promise<CredentialAdapterResult | null> {
    if (!isProductionCredential(credential)) return null;
    const identity = this.identitiesByToken.get(credential.token);
    if (!identity) return null;
    // `claimedRoles` is intentionally NOT read here -- the port's result type
    // has nowhere to put it, by design (FR-027).
    return {
      externalRef: `${PROD_EXTERNAL_REF_PREFIX}${identity.providerUserId}`,
      email: identity.email,
      displayName: identity.displayName,
    };
  }
}
