import type { Meta, StoryObj } from "@storybook/react-vite";

import { LoadingStatePresentation } from "./loading-state-presentation.js";

const meta: Meta<typeof LoadingStatePresentation> = {
  title: "System States/Loading",
  component: LoadingStatePresentation,
  args: {
    label: "Loading clients",
  },
};
export default meta;

type Story = StoryObj<typeof LoadingStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
