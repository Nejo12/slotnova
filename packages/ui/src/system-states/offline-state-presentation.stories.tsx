import type { Meta, StoryObj } from "@storybook/react-vite";

import { OfflineStatePresentation } from "./offline-state-presentation.js";

const meta: Meta<typeof OfflineStatePresentation> = {
  title: "System States/Offline",
  component: OfflineStatePresentation,
  args: {
    title: "You're offline",
    children: "Some data may be out of date until connection returns.",
  },
};
export default meta;

type Story = StoryObj<typeof OfflineStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
