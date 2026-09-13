import { Injectable } from "@nestjs/common";
import { getCorrelationId } from "@slotnova/observability-server";

import { recordAudit } from "../../../audit/index.js";
import { WorkspaceContextService } from "../../../platform/tenancy/workspace-context.service.js";
import { ProblemException } from "../../../../http/problem/problem.exception.js";
import type { InvitationId, UserId, WorkspaceId } from "../../domain/ids.js";
import { InvitationsRepository } from "../../infrastructure/repositories/invitations.repository.js";

@Injectable()
export class RevokeInvitationUseCase {
  constructor(
    private readonly contexts: WorkspaceContextService,
    private readonly invitations: InvitationsRepository,
  ) {}

  async execute(input: {
    workspaceId: WorkspaceId;
    actorUserId: UserId;
    invitationId: InvitationId;
  }): Promise<void> {
    const requestId = getCorrelationId() ?? "untracked-request";
    await this.contexts.run(
      { workspaceId: input.workspaceId, userId: input.actorUserId, requestId },
      async (tx) => {
        const revoked = await this.invitations.revokePending(tx, input.invitationId);
        if (!revoked) throw new ProblemException("not-found");
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          action: "invitation.revoked",
          entityType: "invitation",
          entityId: input.invitationId,
          requestId,
        });
      },
    );
  }
}
