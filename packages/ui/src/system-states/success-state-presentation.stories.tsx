import type { Meta, StoryObj } from "@storybook/react-vite";

import { SuccessStatePresentation } from "./success-state-presentation.js";

const meta: Meta<typeof SuccessStatePresentation> = {
  title: "System States/Success",
  component: SuccessStatePresentation,
  args: {
    title: "Booking confirmed",
    children: "The client has been notified.",
    action: { label: "View booking", onAction: () => {} },
  },
};
export default meta;

type Story = StoryObj<typeof SuccessStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
