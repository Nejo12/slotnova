/**
 * `pnpm db:migrate` — the explicit, gated migration step (ADR-020, FR-060).
 *
 * This binary is the ONLY production entry point to the migration runner. No
 * application (`apps/api`, `apps/worker`) imports the runner, so schema changes
 * can never be applied as a startup side effect. In staging/production this is
 * run as a dedicated release job, separate from deploying application code.
 *
 * Connection: the privileged migration role from `DATABASE_MIGRATION_URL`
 * (see `packages/db/src/config.ts`). Never the application role.
 */
import { resolveDbConfig } from "../config.js";
import { getPendingMigrations, runMigrations, DEFAULT_MIGRATIONS_DIR } from "../migrate.js";
import { Client } from "pg";

const HELP = `slotnova db:migrate — apply reviewed SQL migrations

Usage:
  pnpm db:migrate [options]

Options:
  --dry-run        list pending migrations without applying them
  --to <version>   apply migrations only up to <version> (inclusive)
  --help           show this message

Connection:
  DATABASE_MIGRATION_URL   privileged migration role (required)

Migrations are NEVER applied automatically by application startup.
`;

interface CliArgs {
  help: boolean;
  dryRun: boolean;
  to: string | undefined;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { help: false, dryRun: false, to: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--to": {
        const value = argv[i + 1];
        if (!value) throw new Error("--to requires a version argument");
        args.to = value;
        i += 1;
        break;
      }
      default:
        throw new Error(`unknown argument: ${String(arg)}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const { connectionString } = resolveDbConfig("migration");
  const client = new Client({ connectionString, application_name: "slotnova-migration" });
  await client.connect();

  try {
    if (args.dryRun) {
      const pending = await getPendingMigrations(client, DEFAULT_MIGRATIONS_DIR);
      if (pending.length === 0) {
        process.stdout.write("no pending migrations\n");
      } else {
        process.stdout.write(`pending migrations (${pending.length}):\n`);
        for (const m of pending) process.stdout.write(`  ${m.filename}\n`);
      }
      return;
    }

    const result = await runMigrations({
      client,
      ...(args.to === undefined ? {} : { targetVersion: args.to }),
      logger: (message) => process.stdout.write(`${message}\n`),
    });
    for (const m of result.applied) process.stdout.write(`  applied ${m.filename}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`db:migrate failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
