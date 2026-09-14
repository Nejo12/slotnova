/**
 * Shared shape for a primary action across system-state compositions.
 * Mirrors Nova's own `{ label, onAction }` action shape (Dialog/Toast) so
 * consuming code doesn't juggle two conventions.
 */
export interface SystemStateAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
}
