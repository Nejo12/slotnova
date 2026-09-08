// VIOLATION: server-only observability pulled into a browser bundle.
import { logger } from "../../../packages/observability-server/src/logger";

export const boot = () => logger.info("hi");
