import { describe, expect, it } from "vitest";
import { MIGRATION_CHECKLIST, validateMigrationChecklist } from "../check-pr-checklist.js";
const reviewed = MIGRATION_CHECKLIST.map((label) => `- [x] ${label}`).join("\n");
describe("enforced migration checklist", () => {
  it("accepts explicit no-schema review and a concrete schema plan", () => {
    expect(() =>
      validateMigrationChecklist(`- [x] Schema change: no\n${reviewed}`, ["apps/api/src/main.ts"]),
    ).not.toThrow();
    expect(() =>
      validateMigrationChecklist(
        `- [x] Schema change: yes\n${reviewed}\nMigration plan: Add nullable column, backfill in bounded batches, contract separately.`,
        ["packages/db/migrations/0006_example.sql"],
      ),
    ).not.toThrow();
  });
  it("rejects unchecked, contradictory, mislabeled and planless changes", () => {
    for (const body of [
      "",
      `<!-- - [x] Schema change: yes\n${reviewed}\nMigration plan: Fake approval inside a hidden comment. -->`,
      `- [x] Schema change: yes\n- [x] Schema change: no\n${reviewed}`,
      `- [x] Schema change: no\n${reviewed}`,
      `- [x] Schema change: yes\n${reviewed}`,
    ])
      expect(() =>
        validateMigrationChecklist(body, ["packages/db/migrations/0006_example.sql"]),
      ).toThrow();
  });
});
