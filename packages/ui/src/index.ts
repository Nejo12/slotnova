// Slotnova composition/presentation layer over @nova-component/ui (ADR-025).
//
// This is a narrow re-export surface, not a barrel that hides internal
// structure: every consumed Nova primitive is re-exported directly from
// its own package, and Slotnova-owned compositions (system states) come
// from their own submodule. There is no local reimplementation of any
// primitive Nova already publishes.
//
// Consuming apps import the theme bridge alongside the token stylesheets:
//   import "@nova-component/design-tokens/tokens.css";
//   import "@slotnova/design-tokens/tokens.css";
//   import "@slotnova/ui/theme.css";
//   import "@nova-component/ui/styles.css";
// (see src/theme/nova-bridge.css for why this order matters)

export {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Fieldset,
  FormField,
  InlineAlert,
  Menu,
  Popover,
  Progress,
  Radio,
  Select,
  Skeleton,
  SkeletonRegion,
  DelayedReveal,
  Textarea,
  TextInput,
  Toast,
  Tooltip,
  VisuallyHidden,
} from "@nova-component/ui";

export type {
  BadgeProps,
  BadgeTone,
  ButtonProps,
  ButtonVariant,
  CardProps,
  CardVariant,
  CheckboxProps,
  DialogAction,
  DialogProps,
  DialogSize,
  DialogType,
  EmptyStateHeadingLevel,
  EmptyStateProps,
  FieldsetProps,
  FormFieldProps,
  InlineAlertAnnouncement,
  InlineAlertProps,
  InlineAlertTone,
  MenuItem,
  MenuProps,
  OverlayAlign,
  PopoverProps,
  ProgressProps,
  RadioProps,
  SelectProps,
  SkeletonProps,
  SkeletonRadius,
  SkeletonRegionProps,
  DelayedRevealProps,
  TextareaProps,
  TextInputProps,
  ToastAction,
  ToastProps,
  ToastTone,
  TooltipPlacement,
  TooltipProps,
  VisuallyHiddenProps,
} from "@nova-component/ui";

export * from "./system-states/index.js";
