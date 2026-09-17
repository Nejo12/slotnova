/**
 * `ResolveAvailabilityUseCase` bounded-horizon ordering proof (PR-04, issue
 * #66, FR-015).
 *
 * The 370-day ceiling must be enforced BEFORE the request costs anything —
 * not after a pattern load and an expansion attempt. Asserting that from HTTP
 * alone is impossible (a 422 looks the same either way), so this drives the
 * use case with a pool whose `connect()` always throws: if the rejection is
 * `ExpansionHorizonExceededError` rather than the pool's own failure, the
 * guard provably ran before any database access happened.
 *
 * Deliberately the only place this suite uses a fake — everything else about
 * Scheduling persistence is proven against real PostgreSQL. A real pool
 * cannot express "no connection may be taken" as an assertion.
 */
import { Temporal } from "@js-temporal/polyfill";
import type { Pool } from "@slotnova/db";
import { describe, expect, it } from "vitest";

import { ResolveAvailabilityUseCase } from "../application/resolve-availability.use-case.js";
import { MAX_EXPANSION_HORIZON_DAYS } from "../domain/recurrence.js";
import {
  ExpansionHorizonExceededError,
  InvalidExpansionRangeError,
} from "../domain/scheduling-errors.js";
import { AvailabilityExceptionsRepository } from "../infrastructure/repositories/availability-exceptions.repository.js";
import { AvailabilityPatternsRepository } from "../infrastructure/repositories/availability-patterns.repository.js";

class DatabaseWasTouchedError extends Error {
  override readonly name = "DatabaseWasTouchedError";
  constructor() {
    super("the use case opened a database connection");
  }
}

const unusablePool = {
  connect: () => {
    throw new DatabaseWasTouchedError();
  },
} as unknown as Pool;

function useCase(): ResolveAvailabilityUseCase {
  return new ResolveAvailabilityUseCase(
    unusablePool,
    new AvailabilityPatternsRepository(),
    new AvailabilityExceptionsRepository(),
  );
}

const FROM = Temporal.PlainDate.from("2026-01-01");
const context = { workspaceId: "11111111-1111-4111-8111-111111111111" };

describe("ResolveAvailabilityUseCase range guard", () => {
  it("rejects a range beyond the horizon without opening a connection", async () => {
    await expect(
      useCase().execute(context, {
        from: FROM,
        to: FROM.add({ days: MAX_EXPANSION_HORIZON_DAYS + 1 }),
      }),
    ).rejects.toThrow(ExpansionHorizonExceededError);
  });

  it("rejects an inverted range without opening a connection", async () => {
    await expect(useCase().execute(context, { from: FROM, to: FROM })).rejects.toThrow(
      InvalidExpansionRangeError,
    );
  });

  it("does reach the database for an in-bounds range (the guard is not swallowing everything)", async () => {
    await expect(
      useCase().execute(context, {
        from: FROM,
        to: FROM.add({ days: MAX_EXPANSION_HORIZON_DAYS }),
      }),
    ).rejects.toThrow(DatabaseWasTouchedError);
  });
});
