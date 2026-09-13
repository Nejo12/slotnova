/**
 * CSRF token generation (T037, research R6: double-submit cookie). Pure, no
 * framework dependency -- the Fastify plugin (`csrf.ts`) and the bootstrap
 * controller both call this for a fresh value.
 */
import { randomBytes } from "node:crypto";

const CSRF_TOKEN_BYTES = 32;

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}
