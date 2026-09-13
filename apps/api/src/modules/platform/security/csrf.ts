/**
 * CSRF protection (T037, ADR-007, research R6): double-submit cookie token +
 * strict `Origin`/`Sec-Fetch-Site` verification, enforced once at the Fastify
 * boundary for every state-changing request -- the same "one hook, no
 * per-route opt-in to forget" shape as `registerCorrelationHook`. Safe
 * methods (`GET`/`HEAD`/`OPTIONS`) are exempt and this hook never mutates
 * anything itself, so the hard "no state-changing GET" prohibition holds by
 * construction: nothing here can turn a GET into a write.
 *
 * Builds `application/problem+json` bodies directly with the same shared
 * `problem-types`/`problem-catalogue` helpers the Nest `ProblemExceptionFilter`
 * uses, rather than throwing a Nest `ProblemException` -- this hook runs at
 * the raw Fastify `onRequest` level, before Nest's routing/filter pipeline
 * engages, so a thrown Nest exception would never reach that filter.
 */
import { generateCorrelationId, getCorrelationId } from "@slotnova/observability-server";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { PROBLEM_CATALOGUE } from "../../../http/problem/problem-catalogue.js";
import {
  problemTypeUrl,
  requestInstanceUrl,
  type ProblemDetails,
} from "../../../http/problem/problem-types.js";
import { generateCsrfToken } from "./csrf-token.js";

export const CSRF_COOKIE_BASE_NAME = "slotnova_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfCookieName(secure: boolean): string {
  return secure ? `__Host-${CSRF_COOKIE_BASE_NAME}` : CSRF_COOKIE_BASE_NAME;
}

export interface CsrfConfig {
  /** Same allowlist CORS trusts (`SecurityConfig.corsOrigins`) -- both represent "sites we trust to act as this signed-in user." */
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}

/** Sets a fresh CSRF cookie on `reply` and returns the token value (bootstrap route, sign-in, sign-out). */
export function issueCsrfCookie(reply: FastifyReply, config: CsrfConfig): string {
  const token = generateCsrfToken();
  reply.setCookie(csrfCookieName(config.secureCookies), token, {
    path: "/",
    httpOnly: false, // the SPA must read this to mirror it into the X-CSRF-Token header
    secure: config.secureCookies,
    sameSite: "lax",
  });
  return token;
}

function originIsAllowed(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (originHeader === undefined) return true; // no Origin header: fall through to the double-submit check
  return allowedOrigins.includes(originHeader);
}

function sendCsrfRejection(reply: FastifyReply, detail: string): void {
  const requestId = getCorrelationId() ?? generateCorrelationId();
  const entry = PROBLEM_CATALOGUE.forbidden;
  const problem: ProblemDetails = {
    type: problemTypeUrl("forbidden"),
    title: entry.title,
    status: entry.status,
    detail,
    instance: requestInstanceUrl(requestId),
  };
  reply.status(entry.status).header("content-type", "application/problem+json").send(problem);
}

/**
 * Registers the CSRF-verification hook. Must run AFTER the cookie plugin is
 * registered (`request.cookies` needs it) and after the correlation hook
 * (this hook's rejections read the correlation id for `instance`).
 */
export function registerCsrfProtection(instance: FastifyInstance, config: CsrfConfig): void {
  instance.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (SAFE_METHODS.has(request.method)) return;

    const secFetchSite = request.headers["sec-fetch-site"];
    if (secFetchSite === "cross-site") {
      sendCsrfRejection(reply, "Cross-site request rejected (Sec-Fetch-Site).");
      return;
    }

    const originHeader = request.headers.origin;
    if (!originIsAllowed(originHeader, config.allowedOrigins)) {
      sendCsrfRejection(reply, "Cross-site request rejected (Origin).");
      return;
    }

    const cookieToken = request.cookies[csrfCookieName(config.secureCookies)];
    const headerToken = request.headers[CSRF_HEADER_NAME];
    const presentedHeaderToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    if (cookieToken === undefined || presentedHeaderToken === undefined) {
      sendCsrfRejection(reply, "Missing CSRF token.");
      return;
    }
    if (cookieToken !== presentedHeaderToken) {
      sendCsrfRejection(reply, "CSRF token mismatch.");
      return;
    }
  });
}
