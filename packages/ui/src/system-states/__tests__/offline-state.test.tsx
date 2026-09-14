// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OfflineStatePresentation } from "../offline-state-presentation.js";

describe("OfflineStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("communicates the degraded/offline condition via text", () => {
    render(
      <OfflineStatePresentation title="You're offline">
        Some data may be out of date until connection returns.
      </OfflineStatePresentation>,
    );

    expect(screen.getByText("You're offline")).not.toBeNull();
    expect(
      screen.getByText("Some data may be out of date until connection returns."),
    ).not.toBeNull();
  });

  it("uses a polite (non-interrupting) announcement so the operator isn't blocked mid-task", () => {
    render(<OfflineStatePresentation title="You're offline">Details.</OfflineStatePresentation>);

    expect(screen.getByRole("status")).not.toBeNull();
  });
});
