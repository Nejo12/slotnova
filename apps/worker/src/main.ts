import { createWorker } from "./worker.js";

/**
 * Split from the direct-execution guard below (mirrors `apps/api/src/main.ts`
 * T019) so tests can import this module without starting the keep-alive loop
 * or registering process-wide signal handlers.
 */
export function bootstrap(): void {
  const worker = createWorker();

  const shutdown = (): void => {
    worker.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  worker.start();
}

const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted) {
  bootstrap();
}
