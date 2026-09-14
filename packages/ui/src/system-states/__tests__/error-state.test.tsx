// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorStatePresentation } from "../error-state-presentation.js";

describe("ErrorStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("announces the error via an assertive alert role, not color alone", () => {
    render(
      <ErrorStatePresentation title="Couldn't load clients">Try again.</ErrorStatePresentation>,
    );

    // ErrorStatePresentation always requests Nova's assertive announcement
    // (InlineAlert defaults to no live-region role unless asked).
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Couldn't load clients")).not.toBeNull();
  });

  it("offers a retry action that preserves a safe way forward", () => {
    const onAction = vi.fn();
    render(
      <ErrorStatePresentation title="Couldn't load clients" action={{ label: "Retry", onAction }}>
        Try again.
      </ErrorStatePresentation>,
    );

    screen.getByRole("button", { name: "Retry" }).click();

    expect(onAction).toHaveBeenCalledOnce();
  });
});
