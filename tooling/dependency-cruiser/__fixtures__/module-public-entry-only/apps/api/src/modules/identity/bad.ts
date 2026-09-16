// Violates module-public-entry-only: reaches into audit's domain internals
// instead of importing from apps/api/src/modules/audit/index.ts.
import { AUDIT_LOG_MARKER } from "../audit/domain/audit-log.js";

export const IDENTITY_USES_AUDIT_MARKER = AUDIT_LOG_MARKER;
