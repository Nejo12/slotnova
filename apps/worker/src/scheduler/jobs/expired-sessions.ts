export interface SessionMaintenance {
  expiredSessions(batchSize: number, retentionDays: number): Promise<void>;
}
export const expiredSessions =
  (identity: SessionMaintenance, batchSize: number, retentionDays: number) => () =>
    identity.expiredSessions(batchSize, retentionDays);
