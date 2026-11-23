import type { CSSProperties } from "react";
import { cn } from "@/lib/classes";

export function Skeleton({
  width,
  height,
  className = "",
  "data-ui": dataUi,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
  "data-ui"?: string;
}) {
  return (
    <span
      data-ui={dataUi}
      className={cn(
        "relative block h-3 max-w-full shrink-0 overflow-hidden rounded-sm bg-surface-hover",
        "motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:-translate-x-full motion-safe:after:animate-skeleton-sweep motion-safe:after:bg-linear-to-r/srgb motion-safe:after:from-transparent motion-safe:after:via-foreground/7 motion-safe:after:to-transparent motion-safe:after:content-['']",
        "@max-[38.75rem]/skeleton-view:[[data-ui~='skeleton-result']_>_&:last-child]:hidden max-[37.5rem]:[[data-ui~='skeleton-shell-switchers']_>_&:nth-child(2)]:hidden",
        className,
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRegion({
  children,
  label = "Loading content…",
  className = "",
  "data-ui": dataUi,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  "data-ui"?: string;
}) {
  return (
    <div
      data-ui={dataUi}
      className={cn("@container/skeleton-view w-full min-w-0 in-data-[ui~='skeleton-account-loading']:w-[min(100%,400px)]", className)}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
