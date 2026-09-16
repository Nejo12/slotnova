/**
 * Vitest `setupFiles` entry (task T086) -- installs the global HTTP(S)/fetch
 * denylist for every test in the run, without requiring each test file to
 * opt in. See ./deny-network.ts for what it blocks and why.
 */
import { installNetworkDenylist } from "./deny-network.js";

installNetworkDenylist();
