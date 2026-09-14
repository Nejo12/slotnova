import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query's match state, updating on change. Falls back
 * to `false` when `window.matchMedia` is unavailable (e.g. jsdom without a
 * polyfill in a unit test) rather than throwing, so a component using this
 * hook fails safe to the desktop layout instead of crashing the render.
 */
export function useMediaQuery(query: string): boolean {
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";

  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!supported) return;
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (): void => setMatches(mediaQueryList.matches);
    handleChange();
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, [query, supported]);

  return matches;
}

/** Breakpoint below which the mobile shell renders (deliberate substitution, not compression). */
export const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";
