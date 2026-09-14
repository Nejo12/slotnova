import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Slotnova-local Storybook (T055). Stories here cover Slotnova's
 * composition/theme contract over Nova primitives and the Slotnova
 * system-state presentations — never a re-documentation of Nova's own
 * primitive catalogue (Nova-UI publishes its own Storybook for that).
 */
const config: StorybookConfig = {
  stories: [join(here, "..", "src", "**", "*.stories.tsx")],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
