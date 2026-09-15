import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres } from "@slotnova/db/testing";

const harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
await runMigrations({ connectionString: harness.adminUri });

const admin = new Client({ connectionString: harness.adminUri });
await admin.connect();
await admin.query(`
  INSERT INTO public.users (id, email, display_name)
  VALUES
    ('10000000-0000-4000-8000-000000000001', 'owner@example.test', 'E2E Owner'),
    ('10000000-0000-4000-8000-000000000002', 'staff@example.test', 'E2E Staff');

  INSERT INTO public.workspaces (id, name, slug)
  VALUES
    ('20000000-0000-4000-8000-000000000001', 'E2E Alpha Workspace', 'e2e-alpha'),
    ('20000000-0000-4000-8000-000000000002', 'E2E Beta Workspace', 'e2e-beta'),
    ('20000000-0000-4000-8000-000000000003', 'E2E Restricted Workspace', 'e2e-restricted');

  INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
  VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', ARRAY['members:invite','members:manage']),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'owner', ARRAY['members:invite','members:manage']),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'staff', ARRAY[]::text[]);

  INSERT INTO public.locations (workspace_id, name, timezone)
  VALUES
    ('20000000-0000-4000-8000-000000000001', 'Alpha Front Desk', 'Europe/Berlin'),
    ('20000000-0000-4000-8000-000000000002', 'Beta Treatment Room', 'Europe/Berlin'),
    ('20000000-0000-4000-8000-000000000003', 'Restricted Desk', 'Europe/Berlin');
`);
await admin.end();

const apiEntry = fileURLToPath(new URL("../../apps/api/dist/main.js", import.meta.url));
const api = spawn(process.execPath, [apiEntry], {
  env: {
    ...process.env,
    SLOTNOVA_ENV: "preview",
    DATABASE_URL: harness.appUri,
    API_CORS_ALLOWED_ORIGINS: "http://127.0.0.1:3000",
    API_SECURE_COOKIES: "false",
    API_ENABLE_HSTS: "false",
    API_HOST: "127.0.0.1",
    API_PORT: "3001",
  },
  stdio: "inherit",
});

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  api.kill("SIGTERM");
  await harness.stop();
  process.exit(0);
}

api.on("exit", (code) => {
  if (!closing) {
    void harness.stop().finally(() => process.exit(code ?? 1));
  }
});

process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
