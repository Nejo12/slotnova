import type { Meta, StoryObj } from "@storybook/react-vite";

import { NoResultsStatePresentation } from "./no-results-state-presentation.js";

const meta: Meta<typeof NoResultsStatePresentation> = {
  title: "System States/No Results",
  component: NoResultsStatePresentation,
  args: {
    heading: "No matching clients",
    description: "Search or filters returned nothing.",
    action: { label: "Clear filters", onAction: () => {} },
  },
};
export default meta;

type Story = StoryObj<typeof NoResultsStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
