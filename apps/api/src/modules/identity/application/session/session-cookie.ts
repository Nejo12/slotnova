/**
 * Session cookie naming/attributes (ADR-007: "`HttpOnly`, `Secure`,
 * `SameSite=Lax` cookies, preferring the `__Host-` prefix when deployment
 * topology permits"). `__Host-` requires `Secure` + `Path=/` + no `Domain`
 * attribute and is rejected outright by browsers over plain HTTP, so local
 * dev/test (typically `http://localhost`) cannot use it -- `secure` selects
 * between the two so the cookie name itself reflects what the browser will
 * actually accept.
 */
import { SESSION_TTL_MS } from "./session.service.js";

export const SESSION_COOKIE_BASE_NAME = "slotnova_session";

export function sessionCookieName(secure: boolean): string {
  return secure ? `__Host-${SESSION_COOKIE_BASE_NAME}` : SESSION_COOKIE_BASE_NAME;
}

export interface CookieAttributes {
  readonly path: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly maxAge?: number;
}

export function sessionCookieAttributes(secure: boolean): CookieAttributes {
  return {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** Attributes for clearing the session cookie on sign-out -- same shape, zero lifetime. */
export function clearedSessionCookieAttributes(secure: boolean): CookieAttributes {
  return { ...sessionCookieAttributes(secure), maxAge: 0 };
}
