import { createHash, randomBytes } from "node:crypto";

const RAW_INVITATION_TOKEN_BYTES = 32;

/** 256-bit opaque capability, returned once and never persisted. */
export function generateInvitationToken(): string {
  return randomBytes(RAW_INVITATION_TOKEN_BYTES).toString("base64url");
}

/** Full SHA-256 lookup digest. Unlike sessions, invitation hashes use a text column. */
export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
