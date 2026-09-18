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

  -- Booking/Catalog capabilities are granted explicitly on the membership
  -- row, exactly as the Founder decision on Phase-2 role mapping requires:
  -- identity's DEFAULT_ROLE_PERMISSIONS is deliberately NOT changed here,
  -- because no accepted artifact specifies a role -> capability mapping yet
  -- (see .slotnova/CURRENT.md, "Open Founder decision"). The restricted
  -- workspace keeps an empty permission set so journey-07 still proves the
  -- server-authoritative refusal path.
  INSERT INTO public.memberships (workspace_id, user_id, role, permissions)
  VALUES
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', ARRAY['members:invite','members:manage','catalog:read','catalog:manage','scheduling:read','booking:read','booking:create','booking:edit','booking:cancel','booking:complete']),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'owner', ARRAY['members:invite','members:manage','catalog:read','booking:read','booking:create','booking:edit','booking:cancel','booking:complete']),
    ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'staff', ARRAY[]::text[]);

  -- One active Service per workspace so the PR-08 Booking journey has
  -- something bookable without the E2E run first driving Catalog UI (which
  -- Phase 2 deliberately does not build).
  INSERT INTO public.services
    (id, workspace_id, name, duration_minutes, pre_buffer_minutes, post_buffer_minutes, price_amount_minor, price_currency, active)
  VALUES
    ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'E2E Alpha Haircut', 45, 5, 10, 4500, 'EUR', true),
    ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'E2E Beta Massage', 60, 0, 0, 7000, 'EUR', true);

  -- One 09:00-18:00 availability pattern for the Alpha workspace so the PR-09
  -- Calendar journey has open time to render and to start a booking from.
  -- Seed data only: no schema change, no default role mapping, and Beta /
  -- Restricted deliberately keep none so their calendars stay empty.
  INSERT INTO public.availability_patterns
    (id, workspace_id, timezone, weekly_rule, effective_from, effective_until)
  VALUES
    ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Europe/Berlin',
     '[{"dayOfWeek":1,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":2,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":3,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":4,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":5,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":6,"startMinuteOfDay":540,"endMinuteOfDay":1080},
       {"dayOfWeek":7,"startMinuteOfDay":540,"endMinuteOfDay":1080}]'::jsonb,
     NULL, NULL);

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
