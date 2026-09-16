import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listStableStories } from "../run-visual-regression.js";

function writeFixtureIndex(entries: Record<string, { title: string; name: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "storybook-index-"));
  const file = join(dir, "index.json");
  writeFileSync(file, JSON.stringify({ v: 5, entries }), "utf8");
  return file;
}

describe("listStableStories", () => {
  let tmpFile: string | undefined;

  afterEach(() => {
    if (tmpFile) rmSync(tmpFile, { recursive: true, force: true });
    tmpFile = undefined;
  });

  it("pairs each story's Light and Dark variants from a Storybook index.json", () => {
    tmpFile = writeFixtureIndex({
      "system-states-empty--light": { title: "System States/Empty", name: "Light" },
      "system-states-empty--dark": { title: "System States/Empty", name: "Dark" },
      "system-states-empty--without-action": {
        title: "System States/Empty",
        name: "Without Action",
      },
    });

    const stories = listStableStories(tmpFile);
    expect(stories).toEqual([
      { title: "System States/Empty", lightId: "system-states-empty--light", darkId: "system-states-empty--dark" },
    ]);
  });

  it("only includes entries under System States/, ignoring anything else", () => {
    tmpFile = writeFixtureIndex({
      "other-thing--light": { title: "Other Thing", name: "Light" },
      "other-thing--dark": { title: "Other Thing", name: "Dark" },
    });

    expect(listStableStories(tmpFile)).toEqual([]);
  });

  it("skips a story title missing either its Light or Dark variant", () => {
    tmpFile = writeFixtureIndex({
      "system-states-lonely--light": { title: "System States/Lonely", name: "Light" },
    });

    expect(listStableStories(tmpFile)).toEqual([]);
  });
});
