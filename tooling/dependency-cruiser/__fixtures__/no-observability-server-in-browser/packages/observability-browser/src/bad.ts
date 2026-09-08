// VIOLATION: the browser observability package pulling in server-only
// observability — must never be importable from browser-bound code.
import { logger } from "../../observability-server/src/logger";

export const boot = () => logger.info("hi");
