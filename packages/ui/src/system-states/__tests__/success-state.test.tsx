// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuccessStatePresentation } from "../success-state-presentation.js";

describe("SuccessStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("confirms the completed outcome via text", () => {
    render(
      <SuccessStatePresentation title="Booking confirmed">
        Client notified.
      </SuccessStatePresentation>,
    );

    expect(screen.getByText("Booking confirmed")).not.toBeNull();
    expect(screen.getByText("Client notified.")).not.toBeNull();
  });

  it("exposes the most useful next action when provided", () => {
    const onAction = vi.fn();
    render(
      <SuccessStatePresentation
        title="Booking confirmed"
        action={{ label: "View booking", onAction }}
      >
        Client notified.
      </SuccessStatePresentation>,
    );

    screen.getByRole("button", { name: "View booking" }).click();

    expect(onAction).toHaveBeenCalledOnce();
  });
});
