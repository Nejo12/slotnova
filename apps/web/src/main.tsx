import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles/theme.css";
import "./styles/reduced-motion.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("main.tsx: #root element not found");
}

// The real shell (App) is always the root — including under VITE_E2E — so
// E2E journeys exercise the actual production render path (T063). The
// test-harness is no longer a root replacement; it is reachable only as a
// VITE_E2E-gated route inside App's own router (app/router.tsx), used
// solely to establish a session before a journey navigates to the real
// shell. It remains fully absent from ordinary production builds/routing
// (verified by src/__tests__/production-bundle.test.ts).
createRoot(container as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
