import { createWorker } from "./worker.js";

export async function bootstrap(): Promise<void> {
  const worker = createWorker();
  const shutdown = (): void => {
    void worker.stop().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  try {
    await worker.start();
  } catch (error) {
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
    throw error;
  }
}
const isDirectlyExecuted =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectlyExecuted)
  void bootstrap().catch(() => {
    process.exitCode = 1;
  });
