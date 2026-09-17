/**
 * Record -> boundary-response projection for `/v1/catalog/*`, plus the
 * fail-closed read of the guard-resolved tenant context (PR-02, issue #60).
 *
 * The projection is explicit rather than a spread of the repository record:
 * `ServiceRecord`/`ServiceCategoryRecord` carry `workspaceId`, which no
 * response body has any reason to echo back, and a future column added to
 * either record must not silently appear in the public contract.
 */
import type { FastifyRequest } from "fastify";

import { ProblemException } from "../../../http/problem/problem.exception.js";
import { getRequestWorkspaceContext } from "../../identity/index.js";
import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import type { ServiceCategoryRecord } from "../infrastructure/repositories/service-categories.repository.js";
import type { ServiceRecord } from "../infrastructure/repositories/services.repository.js";
import type { ServiceCategoryResponseBody, ServiceResponseBody } from "./catalog.schema.js";

export function toServiceResponse(record: ServiceRecord): ServiceResponseBody {
  return {
    id: record.id,
    name: record.name,
    categoryId: record.categoryId,
    durationMinutes: record.durationMinutes,
    preBufferMinutes: record.preBufferMinutes,
    postBufferMinutes: record.postBufferMinutes,
    priceAmountMinor: record.price.amountMinor,
    priceCurrency: record.price.currency,
    active: record.active,
  };
}

export function toServiceCategoryResponse(
  record: ServiceCategoryRecord,
): ServiceCategoryResponseBody {
  return { id: record.id, name: record.name, sortOrder: record.sortOrder };
}

/**
 * The active workspace/user as the `CapabilityGuard` resolved them — never
 * from a header, body, or query parameter. Absence means the route was not
 * capability-gated (a wiring mistake): fail closed with the same
 * `session-invalid` every other unauthenticated path returns rather than
 * running tenant work with no tenant.
 */
export function requireWorkspaceContext(request: FastifyRequest): WorkspaceContext {
  const context = getRequestWorkspaceContext(request);
  if (!context) throw new ProblemException("session-invalid");
  return { workspaceId: context.workspaceId, userId: context.userId };
}
