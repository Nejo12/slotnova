/**
 * Marks a handler (or an entire controller class) as requiring a specific
 * capability, read by `CapabilityGuard` (T041, ADR-009). Absence of this
 * metadata means the route is not policy-gated by this guard at all --
 * `CapabilityGuard` passes such routes through unconditionally.
 */
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_CAPABILITY_KEY = "slotnova:requireCapability";

export const RequireCapability = (capability: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
