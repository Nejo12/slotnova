// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DestructiveConfirmState,
  EmptyStatePresentation,
  ErrorStatePresentation,
  LoadingStatePresentation,
  NoResultsStatePresentation,
  OfflineStatePresentation,
  PartialStaleStatePresentation,
  PermissionRestrictedStatePresentation,
  SuccessStatePresentation,
} from "../index.js";

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

describe("System states are axe-clean (D: accessibility)", () => {
  afterEach(() => {
    cleanup();
  });

  it("empty", async () => {
    const { container } = render(
      <EmptyStatePresentation
        heading="No clients yet"
        description="Invite your first client to get started."
        action={{ label: "Add client", onAction: vi.fn() }}
      />,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("loading", async () => {
    const { container } = render(<LoadingStatePresentation label="Loading clients" />);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("no-results", async () => {
    const { container } = render(
      <NoResultsStatePresentation
        heading="No matching clients"
        action={{ label: "Clear filters", onAction: vi.fn() }}
      />,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("error", async () => {
    const { container } = render(
      <ErrorStatePresentation
        title="Couldn't load clients"
        action={{ label: "Retry", onAction: vi.fn() }}
      >
        Try again.
      </ErrorStatePresentation>,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("offline", async () => {
    const { container } = render(
      <OfflineStatePresentation title="You're offline">
        Some data may be out of date until connection returns.
      </OfflineStatePresentation>,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("success", async () => {
    const { container } = render(
      <SuccessStatePresentation
        title="Booking confirmed"
        action={{ label: "View booking", onAction: vi.fn() }}
      >
        Client notified.
      </SuccessStatePresentation>,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("destructive-confirm", async () => {
    const { container } = render(
      <DestructiveConfirmState
        open
        title="Cancel this booking?"
        consequence="This releases the 14:00 slot and cannot be undone."
        cancelLabel="Keep booking"
        confirmAction={{ label: "Cancel booking", onAction: vi.fn() }}
        onClose={vi.fn()}
      />,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("permission-restricted", async () => {
    const { container } = render(
      <PermissionRestrictedStatePresentation
        heading="You can't invite members"
        description="Requires the members:invite permission."
      />,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("partial-stale", async () => {
    const { container } = render(
      <PartialStaleStatePresentation title="Showing cached data">
        Last updated 5 minutes ago.
      </PartialStaleStatePresentation>,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
