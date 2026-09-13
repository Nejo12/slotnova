/**
 * Opaque session token generation/hashing (ADR-007, data-model.md "Session",
 * research R7). Pure — no I/O, no DB, no framework dependency, so it can be
 * unit-tested without a database and imported from the `domain` layer without
 * violating the domain/application/infrastructure boundary.
 *
 * The raw token is what goes to the client (inside the cookie); only a hash
 * of it is ever persisted (`sessions.id`, a `uuid` column -- security-and-
 * audit.md, T036 "opaque raw session token goes to the client; only its safe
 * persisted representation/hash is stored"). SHA-256 is truncated to 16 bytes
 * and formatted as a UUID string to fit that column: the raw token already
 * carries 256 bits of entropy from `randomBytes(32)`, so a 128-bit-truncated
 * digest keeps full practical preimage resistance for a value derived from an
 * already-unguessable secret -- it is a storage encoding, not the primary
 * security boundary (the raw token's own entropy is).
 */
import { createHash, randomBytes } from "node:crypto";

const RAW_TOKEN_BYTES = 32;

/** A fresh, cryptographically random opaque token -- never persisted as-is. */
export function generateOpaqueSessionToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

/**
 * Deterministically derive the `sessions.id` lookup value for a raw token.
 * Formatted as a dashed UUID string so it fits the `uuid` column
 * (`0002_identity.sql`); PostgreSQL's `uuid` input accepts any 32-hex-digit
 * value in this shape regardless of RFC 4122 version/variant bits, and this
 * is a hash digest, not a generated identifier, so no version bits are set.
 */
export function hashSessionToken(rawToken: string): string {
  const digest = createHash("sha256").update(rawToken, "utf8").digest();
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
