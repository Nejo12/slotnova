/**
 * Marks a handler (or an entire controller class) as requiring one or more
 * capabilities, read by `CapabilityGuard` (T041, ADR-009). Absence of this
 * metadata means the route is not policy-gated by this guard at all --
 * `CapabilityGuard` passes such routes through unconditionally.
 *
 * ## Why it takes a rest parameter (PR-09, issue #81)
 *
 * PR-01..PR-08 only ever needed one capability per route, so this decorator
 * stored a single string. Calendar's read-composition endpoint is the first
 * route the accepted contract gates on TWO capabilities
 * (`contracts/calendar.contract.md`: "`booking:read` **and**
 * `scheduling:read` -- the endpoint does not grant new access"), and the
 * three ways of expressing that were:
 *
 *   1. stacking two `@RequireCapability` decorators -- `SetMetadata` on the
 *      same key simply overwrites, so the first one would be silently
 *      dropped and the route would be gated on ONE capability. Silently
 *      weaker authorization is the worst possible outcome here;
 *   2. a second guard class requiring a second key -- two parallel
 *      authorization mechanisms to keep in step, for no gain;
 *   3. this: the existing single decorator and the existing single guard,
 *      accepting a list and requiring ALL of it.
 *
 * (3) is the smallest change that cannot fail open. Every pre-existing call
 * site passes exactly one argument and is unaffected; the guard's rule for a
 * one-element list is byte-for-byte the rule it always applied.
 *
 * At least one capability is required by the type: `@RequireCapability()`
 * with no argument would be metadata that gates nothing while looking like
 * it gates something.
 */
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_CAPABILITY_KEY = "slotnova:requireCapability";

export const RequireCapability = (
  ...capabilities: readonly [string, ...(readonly string[])]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_CAPABILITY_KEY, capabilities);
