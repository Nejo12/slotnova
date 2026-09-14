/**
 * `@slotnova/contracts` -- thin typed-fetch-client adapter (task T065,
 * `docs/decisions/0004-validation-contract-integration.md` "Generated
 * client/types/MSW feasibility proof").
 *
 * This file is a static wrapper, not generated output: it has no
 * per-endpoint logic, it only instantiates `openapi-fetch`'s
 * `createClient<paths>()` against the generated `paths` type
 * (`./generated/types.ts`, produced by `contracts:generate`). ADR-013 /
 * FR-035: this package never imports anything from `apps/api` -- only the
 * generated `.ts` types file, which is itself derived solely from the
 * committed OpenAPI document.
 */
import createClient, { type Client, type ClientOptions } from "openapi-fetch";

import type { paths } from "./generated/types.js";

export type { paths } from "./generated/types.js";
export type ContractsClient = Client<paths>;

/**
 * Creates a typed fetch client against Slotnova's committed API contract.
 * Callers supply `baseUrl` (and any other `openapi-fetch` option, e.g.
 * `credentials: "include"`) -- this factory holds no environment-specific
 * defaults of its own.
 */
export function createContractsClient(options: ClientOptions): ContractsClient {
  return createClient<paths>(options);
}
