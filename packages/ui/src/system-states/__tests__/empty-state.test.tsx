// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyStatePresentation } from "../empty-state-presentation.js";

describe("EmptyStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the heading and description as text, not color-only signaling", () => {
    render(
      <EmptyStatePresentation
        heading="No clients yet"
        description="Invite your first client to get started."
      />,
    );

    expect(screen.getByRole("heading", { name: "No clients yet" })).not.toBeNull();
    expect(screen.getByText("Invite your first client to get started.")).not.toBeNull();
  });

  it("renders a primary action when provided and calls it on click", async () => {
    const onAction = vi.fn();
    render(
      <EmptyStatePresentation
        heading="No clients yet"
        action={{ label: "Add client", onAction }}
      />,
    );

    const button = screen.getByRole("button", { name: "Add client" });
    button.click();

    expect(onAction).toHaveBeenCalledOnce();
  });

  it("omits the action region when no action is provided", () => {
    render(<EmptyStatePresentation heading="No clients yet" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
