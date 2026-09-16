/**
 * Targeted visual regression for Slotnova's stable Storybook primitives
 * (task T088). Scope is deliberately narrow: exactly the stable
 * "System States/*" stories that already ship a Light and a Dark variant
 * (see packages/ui/.storybook/preview.tsx's `parameters.theme` pinning) --
 * no product screens, no full-route snapshots. See
 * docs/standards/ci-quality-gates.md and
 * specs/001-platform-foundation-shell/tasks.md T088.
 */

import { readFileSync } from "node:fs";

export interface StablePair {
  title: string;
  lightId: string;
  darkId: string;
}

interface StorybookIndexEntry {
  title: string;
  name: string;
}

interface StorybookIndex {
  entries: Record<string, StorybookIndexEntry>;
}

/**
 * Read a built Storybook `index.json` and pair up every "System States/*"
 * story that ships both a "Light" and a "Dark" named export. Anything
 * outside that prefix, or missing either variant, is left out -- this is
 * the mechanical enforcement of T088's "targeted screenshots only" scope.
 */
export function listStableStories(indexJsonPath: string): StablePair[] {
  const index = JSON.parse(readFileSync(indexJsonPath, "utf8")) as StorybookIndex;

  const byTitle = new Map<string, { lightId?: string; darkId?: string }>();
  for (const [id, entry] of Object.entries(index.entries)) {
    if (!entry.title.startsWith("System States/")) continue;
    const slot = byTitle.get(entry.title) ?? {};
    if (entry.name === "Light") slot.lightId = id;
    if (entry.name === "Dark") slot.darkId = id;
    byTitle.set(entry.title, slot);
  }

  const pairs: StablePair[] = [];
  for (const [title, { lightId, darkId }] of byTitle) {
    if (lightId && darkId) pairs.push({ title, lightId, darkId });
  }
  return pairs.sort((a, b) => a.title.localeCompare(b.title));
}
