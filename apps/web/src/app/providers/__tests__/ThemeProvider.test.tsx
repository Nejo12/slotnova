// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "../ThemeProvider.js";
import { useTheme } from "../theme-context.js";

function ThemeReadout() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <p data-testid="theme-value">{theme}</p>
      <button type="button" onClick={toggleTheme}>
        Toggle theme
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to light and sets data-theme on the document root", () => {
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggling updates both the context value and data-theme (drives token CSS + Nova bridge)", () => {
    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("persists the chosen theme across remounts", () => {
    const { unmount } = render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    unmount();

    render(
      <ThemeProvider>
        <ThemeReadout />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
  });
});
