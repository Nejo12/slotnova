import { Injectable } from "@nestjs/common";
import { getCorrelationId } from "@slotnova/observability-server";

import { recordAudit } from "../../../audit/index.js";
import { writeOutboxRecord } from "../../../platform/outbox/outbox-writer.js";
import { WorkspaceContextService } from "../../../platform/tenancy/workspace-context.service.js";
import { ProblemException } from "../../../../http/problem/problem.exception.js";
import type { MembershipId, UserId, WorkspaceId } from "../../domain/ids.js";
import { generateInvitationToken, hashInvitationToken } from "../../domain/invitation-token.js";
import type { InvitableRole } from "../../domain/policy/default-role-permissions.js";
import {
  InvitationsRepository,
  type InvitationRecord,
} from "../../infrastructure/repositories/invitations.repository.js";

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class IssueInvitationUseCase {
  constructor(
    private readonly contexts: WorkspaceContextService,
    private readonly invitations: InvitationsRepository,
  ) {}

  async execute(input: {
    workspaceId: WorkspaceId;
    actorUserId: UserId;
    invitedBy: MembershipId;
    email: string;
    role: InvitableRole;
  }): Promise<{ invitation: InvitationRecord; rawToken: string }> {
    const requestId = getCorrelationId() ?? "untracked-request";
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    try {
      const invitation = await this.contexts.run(
        { workspaceId: input.workspaceId, userId: input.actorUserId, requestId },
        async (tx) => {
          const existingUserId = await this.invitations.lockUserByEmail(tx, input.email);
          if (
            existingUserId &&
            (await this.invitations.hasActiveMembership(tx, input.workspaceId, existingUserId))
          ) {
            throw new ProblemException("already-member");
          }

          const created = await this.invitations.createInvitation(tx, {
            workspaceId: input.workspaceId,
            email: input.email,
            role: input.role,
            tokenHash,
            expiresAt,
            invitedBy: input.invitedBy,
          });
          await recordAudit(tx, {
            workspaceId: input.workspaceId,
            actorUserId: input.actorUserId,
            action: "invitation.issued",
            entityType: "invitation",
            entityId: created.id,
            metadata: { role: input.role },
            requestId,
          });
          await writeOutboxRecord(tx, {
            workspaceId: input.workspaceId,
            eventName: "invitation.issued",
            eventVersion: 1,
            payload: { requestId, invitationId: created.id, role: input.role },
          });
          return created;
        },
      );
      return { invitation, rawToken };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new ProblemException("invitation-exists");
      }
      throw error;
    }
  }
}
