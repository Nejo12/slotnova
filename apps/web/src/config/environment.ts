import { z } from "zod";
import { resolveEnvironment, isHosted, type Environment } from "@slotnova/deployment-config";

const webSchema = z.object({
  VITE_API_URL: z.string().default("http://localhost:3001"),
  VITE_E2E: z.enum(["true", "false"]).default("false"),
});
export function resolveWebConfig(env: Environment) {
  const environment = resolveEnvironment(env);
  const result = webSchema.safeParse(env);
  if (!result.success) throw new Error("Invalid public web configuration");
  const { VITE_API_URL: apiUrl, VITE_E2E: e2e } = result.data;
  if (
    Object.keys(env).some(
      (key) => key.startsWith("VITE_") && !["VITE_API_URL", "VITE_E2E"].includes(key),
    )
  )
    throw new Error("Only documented public VITE_ settings may enter the browser build");
  if (isHosted(environment)) {
    if (apiUrl !== "" || e2e === "true")
      throw new Error("Hosted web requires same-origin VITE_API_URL='' and no E2E harness");
  } else if (apiUrl !== "") {
    let url: URL;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new Error("VITE_API_URL must be an HTTP(S) origin or empty for same-origin");
    }
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== apiUrl)
      throw new Error("VITE_API_URL must be an HTTP(S) origin");
  }
  return { environment, apiUrl, e2e: e2e === "true" };
}
