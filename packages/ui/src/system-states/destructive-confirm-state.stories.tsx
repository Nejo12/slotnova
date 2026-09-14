import type { Meta, StoryObj } from "@storybook/react-vite";

import { DestructiveConfirmState } from "./destructive-confirm-state.js";

const meta: Meta<typeof DestructiveConfirmState> = {
  title: "System States/Destructive Confirm",
  component: DestructiveConfirmState,
  args: {
    open: true,
    title: "Cancel this booking?",
    consequence: "This releases the 14:00 slot for Nora Fischer and cannot be undone.",
    cancelLabel: "Keep booking",
    confirmAction: { label: "Cancel booking", onAction: () => {} },
    onClose: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof DestructiveConfirmState>;

export const Light: Story = {
  parameters: { theme: "light" },
};

export const Dark: Story = {
  parameters: { theme: "dark" },
};
