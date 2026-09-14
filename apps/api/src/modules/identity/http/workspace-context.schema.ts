/**
 * Boundary request shape for `POST /v1/auth/session/workspace` (T042,
 * contracts/workspace-context.contract.md).
 *
 * Zod-based since T064 (`docs/decisions/0004-validation-contract-integration.md`)
 * -- same posture as `session.schema.ts`: `createZodDto()` wraps the schema
 * below as a DTO usable for both runtime validation
 * (`./zod-validation.js`'s `ZodValidationPipe`) and OpenAPI generation.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const workspaceSwitchRequestSchema = z.object({
  workspaceId: z.uuid(),
});
export class WorkspaceSwitchRequestDto extends createZodDto(workspaceSwitchRequestSchema) {}
export type WorkspaceSwitchRequestBody = z.infer<typeof workspaceSwitchRequestSchema>;
