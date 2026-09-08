// COMPLIANT: consume the package via its public entry point only.
import { publicThing } from "../../../packages/ui/src/index";

export const use = () => publicThing;
