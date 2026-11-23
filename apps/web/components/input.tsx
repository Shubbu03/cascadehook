import type { ComponentProps } from "react";
import { cn } from "@/lib/classes";

export const controlStyles = "border-0 bg-surface-hover shadow-[inset_0_-2px_transparent] transition-shadow duration-150 ease-[ease] focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)] forced-colors:outline forced-colors:outline-[CanvasText] forced-colors:-outline-offset-1 forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-[Highlight] forced-colors:focus-visible:outline-offset-2 motion-reduce:transition-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(controlStyles, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(controlStyles, className)} />;
}
