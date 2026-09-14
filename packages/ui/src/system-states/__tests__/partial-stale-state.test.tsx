// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PartialStaleStatePresentation } from "../partial-stale-state-presentation.js";

describe("PartialStaleStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows last-updated context so stale numbers are not presented as current truth", () => {
    render(
      <PartialStaleStatePresentation title="Showing cached data">
        Last updated 5 minutes ago.
      </PartialStaleStatePresentation>,
    );

    expect(screen.getByText("Showing cached data")).not.toBeNull();
    expect(screen.getByText("Last updated 5 minutes ago.")).not.toBeNull();
  });
});
