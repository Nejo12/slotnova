import type { WorkspaceSummaryDto } from "./session.schema.js";

export interface ActiveWorkspaceResponseDto extends WorkspaceSummaryDto {
  readonly permissions: readonly string[];
}

export interface MeResponseBody {
  readonly user: { readonly id: string; readonly displayName: string; readonly email: string };
  readonly activeWorkspace: ActiveWorkspaceResponseDto | null;
  readonly workspaces: readonly WorkspaceSummaryDto[];
  readonly session: { readonly expiresAt: string };
}
