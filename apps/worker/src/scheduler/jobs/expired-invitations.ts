export interface InvitationMaintenance {
  expiredInvitations(batchSize: number): Promise<void>;
}
export const expiredInvitations = (identity: InvitationMaintenance, batchSize: number) => () =>
  identity.expiredInvitations(batchSize);
