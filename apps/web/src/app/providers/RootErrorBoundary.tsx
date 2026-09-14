import { ErrorStatePresentation } from "@slotnova/ui";
import { Component, type ReactNode } from "react";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  error: Error | null;
}

/**
 * Root error boundary (T058). Renders the shared Slotnova "error" system
 * state (packages/ui, PR-13) rather than a bespoke error screen — no
 * duplicate presentation lives in apps/web. "Try again" reloads the
 * document; this is a genuine last-resort boundary for render-time errors,
 * not a retry mechanism for a specific failed request.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error("Unhandled error in shell render tree:", error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorStatePresentation
          title="Something went wrong"
          action={{ label: "Try again", onAction: () => window.location.reload() }}
        >
          The application hit an unexpected error. Reloading usually resolves it.
        </ErrorStatePresentation>
      );
    }
    return this.props.children;
  }
}
