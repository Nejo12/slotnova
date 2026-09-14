// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Badge, Button, Card, TextInput } from "../index.js";

describe("Nova primitive consumption (A: representative primitives render through @slotnova/ui)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Button and preserves its click behavior", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    screen.getByRole("button", { name: "Save" }).click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders TextInput and preserves controlled-input behavior", () => {
    render(<TextInput aria-label="Client name" value="Aylin" onChange={() => {}} />);

    const input = screen.getByRole("textbox", { name: "Client name" });
    expect(input).toHaveProperty("value", "Aylin");
  });

  it("renders Badge with tone as a data attribute, not color-only signaling", () => {
    render(<Badge tone="danger">Overdue</Badge>);

    expect(screen.getByText("Overdue").getAttribute("data-tone")).toBe("danger");
  });

  it("renders Card as the requested semantic element", () => {
    render(
      <Card as="article" variant="outlined">
        Client summary
      </Card>,
    );

    expect(screen.getByText("Client summary").closest("article")).not.toBeNull();
  });
});
