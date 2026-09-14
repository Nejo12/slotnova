import type { Preview } from "@storybook/react-vite";

// Required load order: Nova's own primitive-layer tokens first, then
// Slotnova's reconciled semantic tokens, then the Nova->Slotnova bridge,
// then Nova's component stylesheet (see src/theme/nova-bridge.css).
import "@nova-component/design-tokens/tokens.css";
import "@slotnova/design-tokens/tokens.css";
import "../src/theme/nova-bridge.css";
import "@nova-component/ui/styles.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: "Slotnova Light/Dark theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      // A story's own `parameters.theme` pins its theme for visual-regression
      // stability (T088 needs two fixed, screenshot-able story IDs per
      // state); stories without that parameter follow the toolbar global.
      const theme =
        (context.parameters["theme"] as string | undefined) ??
        (context.globals["theme"] as string | undefined) ??
        "light";
      document.documentElement.setAttribute("data-theme", theme);
      return (
        <div
          style={{
            background: "var(--slotnova-surface-bg-page)",
            minHeight: "100vh",
            padding: "1.5rem",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
