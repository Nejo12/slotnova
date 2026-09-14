import { Controller, Get } from "@nestjs/common";
import { ApiResponse, getSchemaPath } from "@nestjs/swagger";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ProblemException } from "../../../http/problem/problem.exception.js";
import { HealthCheckService, type ReadinessChecks } from "./health-check.service.js";

export interface HealthzResponse {
  readonly status: "ok";
  readonly service: "api";
  readonly time: string;
}

export interface ReadyzResponse {
  readonly status: "ready";
  readonly checks: ReadinessChecks;
  readonly time: string;
}

/**
 * `GET /healthz` / `GET /readyz` (T023, contracts/health.contract.md).
 * `healthz` never touches the database (liveness only); `readyz` reports
 * dependency health and returns 503 `problem+json` (via
 * {@link ProblemException}) when anything is degraded — never raw
 * SQL/connection detail.
 */
@Controller()
export class HealthController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get("healthz")
  healthz(): HealthzResponse {
    return { status: "ok", service: "api", time: new Date().toISOString() };
  }

  @Get("readyz")
  // Explicit 200, not left to `@nestjs/swagger`'s implicit-status fallback:
  // that fallback (`api-response.explorer.js`'s `exploreApiResponseMetadata`)
  // only synthesizes a bare `{ description: '' }` response when NO
  // `@ApiResponse` metadata exists on the method at all -- adding the 503
  // below would otherwise silently make the previously-implicit 200 vanish
  // from the document rather than coexist with it (confirmed by reading that
  // explorer's source directly, then reproducing it: the document generated
  // before this file's 503 was added).
  @ApiResponse({ status: 200, description: "All dependencies are reachable (`ready`)." })
  @ApiResponse({
    status: 503,
    description: "A dependency is unreachable/degraded (`not-ready`, with `checks`).",
    content: {
      "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
    },
  })
  async readyz(): Promise<ReadyzResponse> {
    const { ready, checks } = await this.healthCheckService.checkReadiness();
    if (!ready) {
      // `ReadinessChecks` has known keys (no index signature) so its precise
      // success-response typing stays useful on the 200 path above; the
      // problem+json `checks` member accepts any string-keyed record.
      throw new ProblemException("not-ready", { checks: { ...checks } as Record<string, string> });
    }
    return { status: "ready", checks, time: new Date().toISOString() };
  }
}
