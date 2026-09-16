// Compliant: same-module file reaching its own domain internals directly is fine.
import { AUDIT_LOG_MARKER } from "../domain/audit-log.js";

export const USE_CASE_MARKER = AUDIT_LOG_MARKER;
