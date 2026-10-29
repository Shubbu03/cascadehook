import type { CSSProperties } from "react";

export function Skeleton({
  width,
  height,
  className = "",
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}) {
  return (
    <span
      className={"skeleton-block " + className}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRegion({
  children,
  label = "Loading content…",
  className = "",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div className={"skeleton-view " + className} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
