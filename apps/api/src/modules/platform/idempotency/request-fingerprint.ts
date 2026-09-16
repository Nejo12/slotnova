/**
 * Deterministic canonical request fingerprinting (issue #61). A sha256 hex
 * digest of a canonicalized JSON value — property order never affects the
 * digest, so two semantically identical requests (however the client or a
 * JSON parser happened to order their keys) fingerprint identically, and no
 * undocumented JavaScript object insertion-order behavior is load-bearing.
 *
 * Only the digest is persisted (`packages/db/migrations/
 * 0007_platform_idempotency.sql`), never the raw request body, so nothing
 * beyond a comparison hash is durably retained.
 */
import { createHash } from "node:crypto";

export type CanonicalizableValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalizableValue[]
  | { readonly [key: string]: CanonicalizableValue };

/**
 * Recursively sorts object keys so structurally-equal values always produce
 * an identical JSON string, independent of property insertion order. Arrays
 * keep their order — element order is semantically meaningful and must
 * distinguish, not be normalized away.
 */
export function canonicalize(value: CanonicalizableValue): CanonicalizableValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, CanonicalizableValue> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, CanonicalizableValue>)[key]!);
    }
    return result;
  }
  return value;
}

/** Sha256 hex digest (64 lowercase hex chars) of the canonicalized value. */
export function fingerprintRequest(value: CanonicalizableValue): string {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}
