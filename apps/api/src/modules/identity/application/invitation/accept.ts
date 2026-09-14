import { Injectable } from "@nestjs/common";
import { getCorrelationId } from "@slotnova/observability-server";

import { recordAudit } from "../../../audit/index.js";
import { writeOutboxRecord } from "../../../platform/outbox/outbox-writer.js";
import { ProblemException } from "../../../../http/problem/problem.exception.js";
import type { UserId } from "../../domain/ids.js";
import { hashInvitationToken } from "../../domain/invitation-token.js";
import { defaultPermissionsForRole } from "../../domain/policy/default-role-permissions.js";
import {
  InvitationsRepository,
  InvitationTransactions,
  type InvitationRecord,
} from "../../infrastructure/repositories/invitations.repository.js";

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private readonly transactions: InvitationTransactions,
    private readonly invitations: InvitationsRepository,
  ) {}

  async execute(input: {
    rawToken: string;
    userId: UserId;
    userEmail: string;
  }): Promise<InvitationRecord> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.rawToken)) {
      throw new ProblemException("invitation-expired");
    }
    const requestId = getCorrelationId() ?? "untracked-request";
    const tokenHash = hashInvitationToken(input.rawToken);

    return this.transactions.run(async (tx) => {
      await this.transactions.setTokenLookup(tx, tokenHash);
      // PostgreSQL row locking also requires the UPDATE RLS policy. Resolve
      // only the token-bound workspace first, then enter its tenant context
      // before acquiring the single-use row lock and re-reading all state.
      const tokenBoundInvitation = await this.invitations.findByTokenHash(tx, tokenHash, false);
      if (!tokenBoundInvitation) {
        throw new ProblemException("invitation-expired");
      }
      await this.transactions.setWorkspace(tx, {
        workspaceId: tokenBoundInvitation.workspaceId,
        userId: input.userId,
        requestId,
      });
      const invitation = await this.invitations.findByTokenHash(tx, tokenHash, true);
      if (
        !invitation ||
        invitation.status !== "pending" ||
        invitation.expiresAt.getTime() <= Date.now()
      ) {
        throw new ProblemException("invitation-expired");
      }
      if (
        invitation.email.toLocaleLowerCase("en-US") !== input.userEmail.toLocaleLowerCase("en-US")
      ) {
        throw new ProblemException("email-mismatch");
      }

      const workspaceName = await this.invitations.findWorkspaceName(tx, invitation.workspaceId);
      // Serialize against any concurrent membership insertion for this user;
      // the memberships FK also locks this parent row during inserts.
      await this.invitations.lockUserById(tx, input.userId);
      if (await this.invitations.hasMembership(tx, invitation.workspaceId, input.userId)) {
        throw new ProblemException("already-member");
      }

      const permissions = defaultPermissionsForRole(invitation.role);
      const membershipId = await this.invitations.createMembership(tx, {
        workspaceId: invitation.workspaceId,
        userId: input.userId,
        role: invitation.role,
        permissions,
      });
      await this.invitations.markAccepted(tx, invitation.id, input.userId);

      await recordAudit(tx, {
        workspaceId: invitation.workspaceId,
        actorUserId: input.userId,
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { role: invitation.role },
        requestId,
      });
      await recordAudit(tx, {
        workspaceId: invitation.workspaceId,
        actorUserId: input.userId,
        action: "membership.created",
        entityType: "membership",
        entityId: membershipId,
        metadata: { role: invitation.role },
        requestId,
      });
      await writeOutboxRecord(tx, {
        workspaceId: invitation.workspaceId,
        eventName: "invitation.accepted",
        eventVersion: 1,
        payload: { requestId, invitationId: invitation.id, membershipId },
      });
      await writeOutboxRecord(tx, {
        workspaceId: invitation.workspaceId,
        eventName: "membership.created",
        eventVersion: 1,
        payload: { requestId, membershipId, role: invitation.role },
      });
      return { ...invitation, workspaceName, status: "accepted" };
    });
  }
}
