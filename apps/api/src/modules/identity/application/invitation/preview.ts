import { Injectable } from "@nestjs/common";

import { ProblemException } from "../../../../http/problem/problem.exception.js";
import { hashInvitationToken } from "../../domain/invitation-token.js";
import {
  InvitationsRepository,
  InvitationTransactions,
  type InvitationRecord,
} from "../../infrastructure/repositories/invitations.repository.js";

@Injectable()
export class PreviewInvitationUseCase {
  constructor(
    private readonly transactions: InvitationTransactions,
    private readonly invitations: InvitationsRepository,
  ) {}

  async execute(rawToken: string): Promise<InvitationRecord> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
      throw new ProblemException("invitation-not-found");
    }
    return this.transactions.run(async (tx) => {
      const tokenHash = hashInvitationToken(rawToken);
      await this.transactions.setTokenLookup(tx, tokenHash);
      const invitation = await this.invitations.findByTokenHash(tx, tokenHash, false);
      if (!invitation || invitation.status === "revoked") {
        throw new ProblemException("invitation-not-found");
      }
      if (invitation.status !== "pending" || invitation.expiresAt.getTime() <= Date.now()) {
        throw new ProblemException("invitation-expired");
      }
      return invitation;
    });
  }
}
