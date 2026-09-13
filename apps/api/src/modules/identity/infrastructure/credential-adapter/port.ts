/**
 * Credential adapter port (ADR-007, FR-027, research R5). The ONLY thing an
 * adapter does is turn an opaque, adapter-specific credential payload into
 * verified identity information -- or reject it. An adapter:
 *
 *   - never issues, stores, or rotates a session (that is `application/session`, T036);
 *   - never makes an authorization decision (that is T041, a later PR);
 *   - never has its role/permission claims trusted -- Slotnova owns
 *     `memberships.role`/`permissions` as the sole authorization source
 *     (ADR-009), so this port's result type has no role/permission field at
 *     all -- there is nothing for a careless caller to accidentally trust.
 *
 * `T039`'s parity test runs the same assertions against every implementation
 * of this port (the dev adapter here, and a production-shaped test double) to
 * prove session/context/RLS behavior never depends on which adapter verified
 * the credential.
 */
export interface CredentialAdapterResult {
  /** Opaque handle from the adapter/provider; matched against `users.external_ref`. */
  readonly externalRef: string;
  readonly email: string;
  readonly displayName?: string;
}

export interface CredentialAdapter {
  /**
   * Verifies an opaque credential payload. Returns `null` -- never throws --
   * for anything it does not recognize or reject, so the caller can always
   * respond with the same generic `invalid-credentials` problem regardless of
   * why verification failed (contracts/session.contract.md: "do not leak
   * user existence").
   */
  verify(credential: unknown): Promise<CredentialAdapterResult | null>;
}
