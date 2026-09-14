import type { Meta, StoryObj } from "@storybook/react-vite";

import { EmptyStatePresentation } from "./empty-state-presentation.js";

const meta: Meta<typeof EmptyStatePresentation> = {
  title: "System States/Empty",
  component: EmptyStatePresentation,
  args: {
    heading: "No clients yet",
    description: "Invite your first client to get started.",
    action: { label: "Add client", onAction: () => {} },
  },
};
export default meta;

type Story = StoryObj<typeof EmptyStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};

export const WithoutAction: Story = {
  args: {
    heading: "No clients yet",
    description: "Clients will appear here once added.",
  },
  parameters: { theme: "light" },
};
