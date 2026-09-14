import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("main.tsx: #root element not found");
}

async function render(): Promise<void> {
  const Root =
    import.meta.env.VITE_E2E === "true"
      ? (await import("./test-harness/TestHarness.js")).TestHarness
      : App;

  createRoot(container as HTMLElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void render();
