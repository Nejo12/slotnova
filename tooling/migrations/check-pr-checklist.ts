import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MIGRATION_CHECKLIST = [
  "Expand/additive step reviewed",
  "Backward compatibility window reviewed",
  "Data migration/backfill reviewed",
  "Contract/removal step reviewed",
  "Roll-forward and rollback limits documented",
  "RLS/policy impact reviewed",
  "Index/lock risk reviewed",
  "pg-boss impact reviewed",
  "Production migration ordering reviewed",
] as const;
export function validateMigrationChecklist(body: string, paths: readonly string[]): void {
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  const yes = /^- \[x\] Schema change: yes\s*$/im.test(body);
  const no = /^- \[x\] Schema change: no\s*$/im.test(body);
  if (yes === no) throw new Error("Select exactly one Schema change: yes/no checkbox");
  const schemaChanged = paths.some(
    (path) =>
      /^packages\/db\/migrations\/.*\.sql$/.test(path) ||
      /^apps\/worker\/src\/bin\/migrate-scheduler\.ts$/.test(path),
  );
  if (schemaChanged && !yes) throw new Error("Migration changes require Schema change: yes");
  for (const label of MIGRATION_CHECKLIST) {
    if (
      !body.split("\n").some((line) => line.trim().toLowerCase() === `- [x] ${label}`.toLowerCase())
    )
      throw new Error(`Missing migration review: ${label}`);
  }
  if (yes && !/^Migration plan: .{20,}$/m.test(body))
    throw new Error("Schema changes need a concrete Migration plan: paragraph");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const eventPath = process.env["GITHUB_EVENT_PATH"];
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { body: string | null; base: { sha: string }; head: { sha: string } };
  };
  if (!event.pull_request) throw new Error("This check requires a pull_request event");
  const { base, head, body } = event.pull_request;
  if (![base.sha, head.sha].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new Error("Invalid PR commit reference");
  const paths = execFileSync("git", ["diff", "--name-only", `${base.sha}...${head.sha}`], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  validateMigrationChecklist(body ?? "", paths);
}
