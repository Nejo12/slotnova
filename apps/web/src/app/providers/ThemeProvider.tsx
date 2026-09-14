import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ThemeContext, type ThemeMode } from "./theme-context.js";

const STORAGE_KEY = "slotnova-theme";

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Drives `data-theme` on the document root (T061). Every shell surface is
 * token-driven via `@slotnova/design-tokens`' generated CSS, which
 * expresses Light/Dark as `:root[data-theme="light"|"dark"]` blocks
 * (PR-12); `@slotnova/ui`'s Nova bridge (PR-13) consumes the same
 * `--slotnova-*` variables, so setting this one attribute retheme's both
 * layers together — no second theme system, no hard-coded shell colors.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme preference is a per-viewer convenience; a blocked/full
      // storage must not break rendering.
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
