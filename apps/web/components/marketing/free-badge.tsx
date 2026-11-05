import { cn } from "@/lib/classes";

export function FreeBadge({ className }: { className?: string; }) {
  return (
    <span className={cn("inline-block rounded-full bg-accent px-1.5 text-[9px] font-semibold leading-[15px] tracking-[.06em] uppercase text-accent-foreground forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]", className)}>
      Free
    </span>
  );
}
