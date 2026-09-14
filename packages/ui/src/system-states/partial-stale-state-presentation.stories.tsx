import type { Meta, StoryObj } from "@storybook/react-vite";

import { PartialStaleStatePresentation } from "./partial-stale-state-presentation.js";

const meta: Meta<typeof PartialStaleStatePresentation> = {
  title: "System States/Partial Stale",
  component: PartialStaleStatePresentation,
  args: {
    title: "Showing cached data",
    children: "Last updated 5 minutes ago.",
  },
};
export default meta;

type Story = StoryObj<typeof PartialStaleStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
