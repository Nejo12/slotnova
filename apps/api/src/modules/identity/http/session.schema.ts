/**
 * Boundary request/response shapes for `POST|DELETE /v1/auth/session`
 * (T038, contracts/session.contract.md).
 *
 * Zod-based since T064 (`docs/decisions/0004-validation-contract-integration.md`):
 * `nestjs-zod`'s `createZodDto()` wraps each schema below as a DTO class,
 * used both for runtime validation (via this module's
 * `ZodValidationPipe`, `./zod-validation.js`) and for the OpenAPI document
 * (via `@ApiBody`/`@ZodResponse` referencing the DTO) -- a single schema
 * declaration, no duplicated `@ApiProperty` decorators.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * `credential` is intentionally opaque here -- its concrete shape is
 * adapter-specific (dev adapter today, a real IdP credential later) and is
 * validated downstream by `CredentialAdapter.verify()`, not at this
 * boundary. The only HTTP-level requirement is "a JSON object", matching the
 * previous hand-rolled check.
 */
export const signInRequestSchema = z.object({
  credential: z.record(z.string(), z.unknown()),
});
export class SignInRequestDto extends createZodDto(signInRequestSchema) {}
export type SignInRequestBody = z.infer<typeof signInRequestSchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
});
export class UserResponseDto extends createZodDto(userResponseSchema) {}

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});
export class WorkspaceSummaryDto extends createZodDto(workspaceSummarySchema) {}

export const signInResponseSchema = z.object({
  user: userResponseSchema,
  activeWorkspace: workspaceSummarySchema.nullable(),
  workspaces: z.array(workspaceSummarySchema).readonly(),
});
export class SignInResponseDto extends createZodDto(signInResponseSchema) {}
export type SignInResponseBody = z.infer<typeof signInResponseSchema>;
