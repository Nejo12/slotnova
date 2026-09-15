import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getCorrelationId, generateCorrelationId } from "@slotnova/observability-server";
import { PROBLEM_CATALOGUE } from "../../../http/problem/problem-catalogue.js";
import { problemTypeUrl, requestInstanceUrl } from "../../../http/problem/problem-types.js";

export interface RateLimitConfig {
  authMax: number;
  previewMax: number;
  windowMs: number;
  maxKeys: number;
}
interface Counter {
  count: number;
  resetAt: number;
}

/** Bounded, per-process abuse counters only; no business/session changes on GET. */
export class RequestRateLimits {
  private readonly counters = new Map<string, Counter>();
  constructor(private readonly config: RateLimitConfig) {}
  check(keys: readonly string[], limit: number, now = Date.now()): number {
    for (const key of keys) {
      let counter = this.counters.get(key);
      if (!counter || counter.resetAt <= now) {
        if (!counter && this.counters.size >= this.config.maxKeys) {
          for (const [candidate, value] of this.counters)
            if (value.resetAt <= now) this.counters.delete(candidate);
          if (this.counters.size >= this.config.maxKeys)
            return Math.ceil(this.config.windowMs / 1000);
        }
        counter = { count: 0, resetAt: now + this.config.windowMs };
        this.counters.set(key, counter);
      }
      // Saturate the count; unlimited rejected requests cannot grow numbers or memory.
      counter.count = Math.min(counter.count + 1, limit + 1);
      if (counter.count > limit) return Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
    }
    return 0;
  }
}
function reject(reply: FastifyReply, retryAfter: number) {
  const requestId = getCorrelationId() ?? generateCorrelationId();
  return reply
    .code(429)
    .type("application/problem+json")
    .header("retry-after", String(retryAfter))
    .header("cache-control", "no-store")
    .send({
      type: problemTypeUrl("rate-limited"),
      title: PROBLEM_CATALOGUE["rate-limited"].title,
      status: 429,
      instance: requestInstanceUrl(requestId),
      requestId,
    });
}
export function registerRateLimits(instance: FastifyInstance, config: RateLimitConfig): void {
  const limiter = new RequestRateLimits(config);
  // CSRF, Helmet and CORS onRequest hooks must finish before a 429 reply.
  // preValidation still runs before Nest guards, DTO validation and controllers.
  instance.addHook("preValidation", async (request, reply) => {
    const route = request.routeOptions.url;
    let retry = 0;
    if (
      (request.method === "POST" && route === "/v1/auth/session") ||
      (request.method === "GET" && route === "/v1/auth/csrf")
    ) {
      // Bootstrap and credential attempts have separate budgets to avoid starving a legitimate bootstrap.
      retry = limiter.check([`${request.method}:auth:${request.ip}`], config.authMax);
    } else if (
      (request.method === "GET" || request.method === "HEAD") &&
      route === "/v1/invitations/:token"
    ) {
      const token = (request.params as { token: string }).token;
      const hash = createHash("sha256").update(token).digest("hex");
      retry = limiter.check(
        [`preview-ip:${request.ip}`, `preview-token:${hash}`],
        config.previewMax,
      );
    }
    if (retry) return reject(reply, retry);
  });
}
