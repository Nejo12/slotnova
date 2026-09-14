import { Injectable } from "@nestjs/common";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { hashInvitationToken } from "../domain/invitation-token.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_TRACKED_KEYS = 10_000;

interface Counter {
  count: number;
  resetAt: number;
}

/** Narrow, process-local Phase-1 protection for the sole public token endpoint. */
@Injectable()
export class InvitationPreviewRateLimiter {
  private readonly counters = new Map<string, Counter>();

  check(rawToken: string, ip: string, now = Date.now()): void {
    this.increment(`ip:${ip}`, now);
    this.increment(`token:${hashInvitationToken(rawToken)}`, now);
  }

  private increment(key: string, now: number): void {
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.counters.size >= MAX_TRACKED_KEYS) {
        for (const [candidate, counter] of this.counters) {
          if (counter.resetAt <= now) this.counters.delete(candidate);
        }
        if (this.counters.size >= MAX_TRACKED_KEYS) {
          throw new ProblemException("rate-limited");
        }
      }
      this.counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    current.count += 1;
    if (current.count > MAX_REQUESTS_PER_WINDOW) {
      throw new ProblemException("rate-limited");
    }
  }
}
