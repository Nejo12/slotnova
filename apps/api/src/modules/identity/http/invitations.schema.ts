/**
 * Boundary request/response shapes for `/v1/invitations*`
 * (T044-T047, contracts/invitation.contract.md).
 *
 * Zod-based since T064 (`docs/decisions/0004-validation-contract-integration.md`)
 * -- `createZodDto()` wraps each schema below as a DTO usable for both
 * runtime validation (`../../../http/validation/zod-validation.js`'s `ZodValidationPipe`) and
 * OpenAPI generation (`@ApiBody`/`@ApiParam`/`@ZodResponse`).
 */
import { createZodDto } from "../../../http/openapi/zod-dto.js";
import { z } from "zod";

import type { InvitableRole } from "../domain/policy/default-role-permissions.js";

const INVITABLE_ROLES = ["admin", "manager", "staff"] as const satisfies readonly InvitableRole[];

export const issueInvitationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).email(),
  role: z.enum(INVITABLE_ROLES),
});
export class IssueInvitationRequestDto extends createZodDto(issueInvitationRequestSchema) {}
export type IssueInvitationRequestBody = z.infer<typeof issueInvitationRequestSchema>;

export const revokeInvitationRequestSchema = z.object({
  status: z.literal("revoked"),
});
export class RevokeInvitationRequestDto extends createZodDto(revokeInvitationRequestSchema) {}

/**
 * A bare string schema (not object-shaped), so it is passed directly to
 * `ZodValidationPipe` as a schema rather than wrapped in `createZodDto` --
 * `nestjs-zod`'s DTO classes require an object-returning schema.
 */
export const invitationIdParamSchema = z.uuid();

export const issueInvitationResponseSchema = z.object({
  invitation: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    status: z.string(),
    expiresAt: z.string(),
  }),
  token: z.string().optional(),
});
export class IssueInvitationResponseDto extends createZodDto(issueInvitationResponseSchema) {}

export const invitationPreviewResponseSchema = z.object({
  workspaceName: z.string(),
  role: z.string(),
  email: z.string(),
  status: z.string(),
  expiresAt: z.string(),
});
export class InvitationPreviewResponseDto extends createZodDto(invitationPreviewResponseSchema) {}
