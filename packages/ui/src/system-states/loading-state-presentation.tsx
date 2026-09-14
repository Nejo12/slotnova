import { Skeleton, SkeletonRegion } from "@nova-component/ui";

export interface LoadingStatePresentationProps {
  label: string;
  /** Number of skeleton rows to render while preserving layout height. */
  rows?: number;
  /** Height of each skeleton row (CSS length); keeps layout stable while loading. */
  rowHeight?: string;
}

/**
 * "Loading" system state. Wraps Nova's `SkeletonRegion` (role="status",
 * aria-busy, visually-hidden label) around a fixed number of `Skeleton`
 * rows, so screen readers announce the busy state via text/semantics and
 * sighted users see a stable layout shape rather than a shifting page —
 * docs/standards/motion.md "loading animation must not cause layout shift
 * where skeleton/layout preservation is possible".
 */
export function LoadingStatePresentation({
  label,
  rows = 3,
  rowHeight = "1rem",
}: LoadingStatePresentationProps) {
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={rowHeight} />
      ))}
    </SkeletonRegion>
  );
}
