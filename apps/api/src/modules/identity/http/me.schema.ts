/**
 * Response boundary shape for `GET /v1/me` (T038,
 * contracts/workspace-context.contract.md). Read-only -- no request body, so
 * only a response schema/DTO exists here.
 *
 * Zod-based since T064 (`docs/decisions/0004-validation-contract-integration.md`):
 * this schema is the single source for both the runtime response shape and
 * the OpenAPI document (via `createZodDto` + `@ZodResponse`) -- no
 * hand-duplicated `@ApiProperty` decorators.
 */
import { createZodDto } from "../../../http/openapi/zod-dto.js";
import { z } from "zod";

import { workspaceSummarySchema } from "./session.schema.js";

export const activeWorkspaceResponseSchema = workspaceSummarySchema.extend({
  permissions: z.array(z.string()).readonly(),
});
export class ActiveWorkspaceResponseDto extends createZodDto(activeWorkspaceResponseSchema) {}

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    email: z.string(),
  }),
  activeWorkspace: activeWorkspaceResponseSchema.nullable(),
  workspaces: z.array(workspaceSummarySchema).readonly(),
  session: z.object({ expiresAt: z.string() }),
});
export class MeResponseDto extends createZodDto(meResponseSchema) {}
export type MeResponseBody = z.infer<typeof meResponseSchema>;
