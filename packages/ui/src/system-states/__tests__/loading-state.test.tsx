// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoadingStatePresentation } from "../loading-state-presentation.js";

describe("LoadingStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("exposes an accessible label announcing the loading state, not color alone", () => {
    render(<LoadingStatePresentation label="Loading clients" />);

    expect(screen.getByText("Loading clients")).not.toBeNull();
  });

  it("renders an aria-busy status region wrapping the skeleton rows", () => {
    render(<LoadingStatePresentation label="Loading clients" />);

    // Nova's SkeletonRegion wraps children in role="status" aria-busy="true";
    // `status` is not a naming-from-content role per the accname spec, so the
    // visually-hidden label is verified separately via getByText above.
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-busy")).toBe("true");
  });
});
