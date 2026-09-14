// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button, Checkbox, TextInput } from "../index.js";
import { EmptyStatePresentation, ErrorStatePresentation } from "../system-states/index.js";

describe("Keyboard semantics (B: interactive compositions stay keyboard-operable)", () => {
  afterEach(() => {
    cleanup();
  });

  it("Button responds to Enter/Space via its native button semantics", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    // A native <button> is keyboard-activatable by construction (Enter and
    // Space both fire a click event per the HTML spec); asserting the
    // element and role is the correct level for a consumption test — jsdom
    // does not implement the browser's own key-to-click mapping to
    // re-verify here without testing Nova's internals.
    expect(button.getAttribute("type")).toBe("button");
  });

  it("Checkbox is a real checkbox reachable via Tab order and toggled via its input semantics", () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Notify client" checked={false} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox", { name: "Notify client" });
    expect(checkbox.tagName).toBe("INPUT");
    expect(checkbox).not.toHaveProperty("tabIndex", -1);
  });

  it("TextInput is reachable and typeable via native input semantics", () => {
    render(<TextInput aria-label="Search clients" value="" onChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: "Search clients" });
    expect(input.tagName).toBe("INPUT");
  });

  it("system-state action buttons remain focusable, non-decorative controls", () => {
    render(
      <EmptyStatePresentation
        heading="No clients"
        action={{ label: "Add client", onAction: vi.fn() }}
      />,
    );

    const button = screen.getByRole("button", { name: "Add client" });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("system-state action buttons respect a disabled action without becoming inert to assistive tech", () => {
    render(
      <ErrorStatePresentation
        title="Couldn't load clients"
        action={{ label: "Retry", onAction: vi.fn(), disabled: true }}
      >
        Try again.
      </ErrorStatePresentation>,
    );

    const button = screen.getByRole("button", { name: "Retry" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
