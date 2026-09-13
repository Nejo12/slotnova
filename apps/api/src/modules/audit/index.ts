/**
 * `audit` module public entry point (T032). Other modules call
 * {@link recordAudit} through this import — never `audit_records` or
 * `infrastructure/**` directly (constitution III; enforced mechanically by
 * `no-cross-module-internals` in `tooling/dependency-cruiser/.dependency-cruiser.cjs`).
 *
 * No read API is exported: there is no audit read UI/API in Phase 1
 * (roadmap Phase 6).
 */
export type {
  AuditRecord,
  RecordAudit,
  RecordAuditInput,
} from "./application/record-audit.port.js";
export { recordAudit } from "./infrastructure/audit-writer.js";
export { asAuditRecordId, type AuditRecordId } from "./domain/ids.js";
