import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Minimal runnable skeleton (T025). No production shell, routing, or
// design-token wiring here — that arrives with PR-12/PR-14.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
