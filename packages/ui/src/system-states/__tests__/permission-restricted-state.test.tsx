// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PermissionRestrictedStatePresentation } from "../permission-restricted-state-presentation.js";

describe("PermissionRestrictedStatePresentation", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains what the operator cannot do and which capability is required", () => {
    render(
      <PermissionRestrictedStatePresentation
        heading="You can't invite members"
        description="Requires the members:invite permission."
      />,
    );

    expect(screen.getByRole("heading", { name: "You can't invite members" })).not.toBeNull();
    expect(screen.getByText("Requires the members:invite permission.")).not.toBeNull();
  });

  it("preserves a safe way out via an optional action", () => {
    render(
      <PermissionRestrictedStatePresentation
        heading="You can't invite members"
        description="Requires the members:invite permission."
      />,
    );

    // No action provided: no dangling/broken control should be rendered.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
