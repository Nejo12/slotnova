// VIOLATION: frontend importing database code.
import { query } from "../../../packages/db/src/client";

export const load = () => query();
