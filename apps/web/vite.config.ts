import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { resolveWebConfig } from "./src/config/environment.js";

export default defineConfig(({ mode }) => {
  const config = resolveWebConfig({ ...loadEnv(mode, process.cwd(), ""), ...process.env });
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(config.apiUrl),
      "import.meta.env.VITE_E2E": JSON.stringify(String(config.e2e)),
    },
    server: { port: 3000 },
  };
});
