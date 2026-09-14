import type { Meta, StoryObj } from "@storybook/react-vite";

import { PermissionRestrictedStatePresentation } from "./permission-restricted-state-presentation.js";

const meta: Meta<typeof PermissionRestrictedStatePresentation> = {
  title: "System States/Permission Restricted",
  component: PermissionRestrictedStatePresentation,
  args: {
    heading: "You can't invite members",
    description: "Requires the members:invite permission. Ask a workspace owner or admin.",
  },
};
export default meta;

type Story = StoryObj<typeof PermissionRestrictedStatePresentation>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
