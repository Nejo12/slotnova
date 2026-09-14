// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoResultsStatePresentation } from "../no-results-state-presentation.js";

describe("NoResultsStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("communicates the no-results outcome via text", () => {
    render(<NoResultsStatePresentation heading="No matching clients" />);

    expect(screen.getByRole("heading", { name: "No matching clients" })).not.toBeNull();
  });

  it("offers a reset action that clears the current query when provided", () => {
    const onAction = vi.fn();
    render(
      <NoResultsStatePresentation
        heading="No matching clients"
        action={{ label: "Clear filters", onAction }}
      />,
    );

    screen.getByRole("button", { name: "Clear filters" }).click();

    expect(onAction).toHaveBeenCalledOnce();
  });
});
