import { applyOverride, type Override } from "./override.js";
import { testId, testTimestamp } from "./ids.js";

/**
 * Test-data shape for a workspace (tenant). This is a fixture contract for
 * platform-shell tests — **not** a domain model or database schema. Product
 * modules define their own persisted types in their infrastructure layer.
 */
export interface WorkspaceShape {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: string;
  readonly settings: WorkspaceSettingsShape;
}

export interface WorkspaceSettingsShape {
  readonly timeZone: string;
  readonly locale: string;
  readonly theme: "system" | "light" | "dark";
}

/** Valid-by-default workspace. Fresh object (including nested `settings`) per call. */
export function buildWorkspace(override?: Override<WorkspaceShape>): WorkspaceShape {
  return applyOverride(
    {
      id: testId("workspace"),
      slug: "acme-studio",
      name: "Acme Studio",
      createdAt: testTimestamp(),
      settings: {
        timeZone: "Europe/Berlin",
        locale: "en-DE",
        theme: "system",
      },
    },
    override,
  );
}
