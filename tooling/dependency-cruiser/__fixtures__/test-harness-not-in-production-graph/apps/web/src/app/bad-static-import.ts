// Violates test-harness-not-in-production-graph: a static import of the
// harness from ordinary application code, not the one allowlisted dynamic
// import() in apps/web/src/app/router.tsx.
import { TEST_HARNESS_MARKER } from "../test-harness/TestHarness.js";

export const LEAKED_MARKER = TEST_HARNESS_MARKER;
