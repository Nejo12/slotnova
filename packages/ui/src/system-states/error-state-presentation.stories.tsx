import type { Meta, StoryObj } from "@storybook/react-vite";

import { ErrorStatePresentation } from "./error-state-presentation.js";

const meta: Meta<typeof ErrorStatePresentation> = {
  title: "System States/Error",
  component: ErrorStatePresentation,
  args: {
    title: "Couldn't load clients",
    children: "Check your connection and try again.",
    action: { label: "Retry", onAction: () => {} },
  },
};
export default meta;

type Story = StoryObj<typeof ErrorStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
