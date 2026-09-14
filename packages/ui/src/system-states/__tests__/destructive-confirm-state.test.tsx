// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DestructiveConfirmState } from "../destructive-confirm-state.js";

// jsdom does not implement the native <dialog> modal methods Nova's Dialog
// calls (showModal/close); polyfill their side effects on the `open`
// attribute so the component's own effect logic runs unmodified.
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

describe("DestructiveConfirmState", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the consequence via text when open", () => {
    render(
      <DestructiveConfirmState
        open
        title="Cancel this booking?"
        consequence="This releases the 14:00 slot and cannot be undone."
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancel this booking?")).not.toBeNull();
    expect(screen.getByText("This releases the 14:00 slot and cannot be undone.")).not.toBeNull();
  });

  it("keeps a safe cancel path that does not perform the destructive action", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DestructiveConfirmState
        open
        title="Cancel this booking?"
        consequence="This cannot be undone."
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: onConfirm }}
        onClose={onClose}
      />,
    );

    screen.getByRole("button", { name: "Keep booking" }).click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("invokes the destructive action only via its own explicit control", () => {
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirmState
        open
        title="Cancel this booking?"
        consequence="This cannot be undone."
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: onConfirm }}
        onClose={vi.fn()}
      />,
    );

    screen.getByRole("button", { name: "Cancel booking" }).click();

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("is not the native open modal when closed", () => {
    const { container } = render(
      <DestructiveConfirmState
        open={false}
        title="Cancel this booking?"
        consequence="This cannot be undone."
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );

    // Nova's Dialog always renders the <dialog> element; `open` drives its
    // native modal state (showModal/close), not conditional mounting.
    const dialog = container.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(false);
  });
});
