import { z } from "zod";

export type Environment = Record<string, string | undefined>;
export const environmentClassSchema = z.enum(["local", "preview", "staging", "production"]);
export type EnvironmentClass = z.infer<typeof environmentClassSchema>;

/** This package contains only the repeated deployment-boundary schema, never secrets. */
export function resolveEnvironment(env: Environment): EnvironmentClass {
  const result = environmentClassSchema.safeParse(env["SLOTNOVA_ENV"]);
  if (!result.success)
    throw new Error("SLOTNOVA_ENV must be local | preview | staging | production");
  return result.data;
}

export function isHosted(environment: EnvironmentClass): boolean {
  return environment === "staging" || environment === "production";
}
