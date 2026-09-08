// VIOLATION: reaching past a package's public entry point into its internals.
import { secret } from "../../../packages/ui/src/internal/secret";

export const use = () => secret;
