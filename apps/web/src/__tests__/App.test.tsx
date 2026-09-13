// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { checkApiHealth } from "../health/check-api-health.js";

vi.mock("../health/check-api-health.js", () => ({
  checkApiHealth: vi.fn(),
}));

const mockedCheckApiHealth = vi.mocked(checkApiHealth);

describe("App (T025)", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("renders the Slotnova heading", () => {
    mockedCheckApiHealth.mockResolvedValue({ status: "healthy" });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Slotnova" })).toBeDefined();
  });

  it("shows a healthy state once the API health ping succeeds", async () => {
    mockedCheckApiHealth.mockResolvedValue({ status: "healthy" });

    render(<App />);

    await waitFor(() => expect(screen.getByText(/api: healthy/i)).toBeDefined());
  });

  it("shows an error state when the API health ping fails", async () => {
    mockedCheckApiHealth.mockResolvedValue({ status: "unhealthy", detail: "network down" });

    render(<App />);

    await waitFor(() => expect(screen.getByText(/api: unhealthy — network down/i)).toBeDefined());
  });
});
