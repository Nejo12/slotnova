// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "../index.js";

// jsdom does not implement the native <dialog> modal methods Nova's Dialog
// calls (showModal/close); polyfill their side effects on the `open`
// attribute so the component's own effect/focus logic runs unmodified.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
});

describe("Dialog (Nova consumption contract, C: keyboard/focus)", () => {
  afterEach(() => {
    cleanup();
  });

  it("moves focus into the dialog when it opens", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    render(
      <Dialog
        open
        title="Confirm"
        action={{ label: "Confirm", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    // Focus must have moved off the invoking control into the dialog.
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement?.closest("dialog")).not.toBeNull();

    trigger.remove();
  });

  it("traps Tab focus within the dialog's interactive controls", () => {
    render(
      <Dialog
        open
        title="Confirm"
        type="confirmation"
        cancellable
        cancelLabel="Cancel"
        action={{ label: "Confirm", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    // The dialog's own keydown handler intercepts Tab/Shift+Tab and wraps
    // focus between its first and last focusable control (cancelButton and
    // confirmButton here) — verified against the dialog element directly
    // since jsdom does not implement native focus-trap-on-Tab itself.
    const dialogEl = confirmButton.closest("dialog");
    expect(dialogEl).not.toBeNull();

    confirmButton.focus();
    expect(document.activeElement).toBe(confirmButton);

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialogEl?.dispatchEvent(tabEvent);

    expect(document.activeElement).toBe(cancelButton);
  });

  it("closes on Escape (native dialog cancel event) when cancellable", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog
        open
        title="Confirm"
        type="confirmation"
        cancellable
        cancelLabel="Cancel"
        action={{ label: "Confirm", onAction: vi.fn() }}
        onClose={onClose}
      />,
    );

    const dialogEl = container.querySelector("dialog");
    expect(dialogEl).not.toBeNull();

    // The browser fires a native `cancel` event on <dialog> for Escape;
    // Nova's onCancel handler maps that to onClose when cancellable.
    dialogEl?.dispatchEvent(new Event("cancel", { bubbles: false, cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores focus to the invoking control after close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Dialog
        open
        title="Confirm"
        action={{ label: "Confirm", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <Dialog
        open={false}
        title="Confirm"
        action={{ label: "Confirm", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
