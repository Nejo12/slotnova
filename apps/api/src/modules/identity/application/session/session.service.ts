/**
 * Session service (T036): issue / validate / rotate / revoke, the only
 * operations that ever touch `identity.sessions` (ADR-007, research R7,
 * contracts/session.contract.md).
 *
 * Server-authoritative: `expiresAt` is computed here from server time, never
 * accepted from a caller; a revoked/expired/missing session always resolves
 * to `null` from {@link validate} (fail closed by construction --
 * `SessionsRepository.findActiveByHashedId` already excludes them at the SQL
 * layer, so there is no separate "is it still valid" check to forget).
 */
import { Injectable } from "@nestjs/common";

import type { SessionId, UserId, WorkspaceId } from "../../domain/ids.js";
import { generateOpaqueSessionToken, hashSessionToken } from "../../domain/session-token.js";
import type { SessionRecord } from "../../infrastructure/repositories/sessions.repository.js";
import { SessionsRepository } from "../../infrastructure/repositories/sessions.repository.js";

/** Absolute session lifetime (data-model.md "expires_at ... absolute + sliding expiry"). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface IssueSessionInput {
  readonly userId: UserId;
  readonly activeWorkspaceId: WorkspaceId | null;
  readonly clientHint?: Readonly<Record<string, unknown>>;
}

export interface IssuedSession {
  /** The opaque value to place in the session cookie -- never persisted. */
  readonly rawToken: string;
  readonly session: SessionRecord;
}

export interface RotateSessionOverrides {
  /** Present (even as `null`) to change the active workspace on rotation; absent to keep it. */
  readonly activeWorkspaceId?: WorkspaceId | null;
}

@Injectable()
export class SessionService {
  constructor(private readonly sessions: SessionsRepository) {}

  async issue(input: IssueSessionInput): Promise<IssuedSession> {
    const rawToken = generateOpaqueSessionToken();
    const session = await this.sessions.insert({
      hashedId: hashSessionToken(rawToken),
      userId: input.userId,
      activeWorkspaceId: input.activeWorkspaceId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      rotatedFrom: null,
      clientHint: input.clientHint ?? {},
    });
    return { rawToken, session };
  }

  /** Fails closed: returns `null` for a missing, revoked, or expired session. Never throws for an invalid token. */
  async validate(rawToken: string): Promise<SessionRecord | null> {
    const hashedId = hashSessionToken(rawToken);
    const session = await this.sessions.findActiveByHashedId(hashedId);
    if (!session) return null;
    await this.sessions.touchLastSeen(hashedId);
    return session;
  }

  /**
   * Atomically supersedes a valid session with a freshly issued one (ADR-007
   * "rotate on sign-in, workspace switch, and privilege change"; this PR's
   * endpoints only call {@link issue} directly for sign-in -- every issuance
   * is already a fresh id -- so `rotate` here is exercised by its own tests
   * and reserved for the workspace-switch/privilege-change callers T042/T045
   * add in later PRs). Returns `null`, without side effects, if the presented
   * token is not currently valid.
   *
   * Delegates the revoke+insert pair to
   * {@link SessionsRepository.rotateAtomically}, which runs both in ONE
   * transaction: if the insert fails, the revoke rolls back too, and
   * PostgreSQL's row lock on the conditional revoke serializes concurrent
   * rotation attempts against the same session so at most one can ever
   * supersede it (review correction -- this was previously two separate,
   * non-atomic pool calls).
   */
  async rotate(
    rawToken: string,
    overrides: RotateSessionOverrides = {},
  ): Promise<IssuedSession | null> {
    const hashedId = hashSessionToken(rawToken);
    const nextRawToken = generateOpaqueSessionToken();
    const nextHashedId = hashSessionToken(nextRawToken);

    const result = await this.sessions.rotateAtomically(hashedId, (previous) => ({
      hashedId: nextHashedId,
      userId: previous.userId,
      activeWorkspaceId:
        "activeWorkspaceId" in overrides
          ? (overrides.activeWorkspaceId ?? null)
          : previous.activeWorkspaceId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      rotatedFrom: previous.id as SessionId,
      clientHint: {},
    }));
    if (!result) return null;

    return { rawToken: nextRawToken, session: result.next };
  }

  /** Idempotent: revoking an already-invalid or unknown token never throws. */
  async revoke(rawToken: string): Promise<void> {
    await this.sessions.revoke(hashSessionToken(rawToken));
  }
}
