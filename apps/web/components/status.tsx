import type { ComponentProps } from "react";
import { cn } from "@/lib/classes";

const tones = {
  success: "bg-success-subtle text-success",
  danger: "bg-danger-subtle text-danger",
  warning: "bg-warning-subtle text-warning",
  neutral: "bg-surface-hover text-muted",
};

export function Status({ tone, className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof tones; }) {
  return <span {...props} className={cn(
    "inline-flex w-fit items-center gap-1.25 rounded-sm px-1.75 py-1 font-mono font-normal text-[10px]/normal whitespace-nowrap",
    "in-data-[ui~='endpoint-row']:whitespace-normal in-data-[ui~='endpoint-row']:text-[11px] in-data-[ui~='endpoint-panel-heading']:ml-auto in-data-[ui~='endpoint-panel-heading']:max-w-full in-data-[ui~='endpoint-panel-heading']:whitespace-normal in-data-[ui~='endpoint-panel-heading']:text-[10px] in-data-[ui~='delivery-context']:text-[10px] in-data-[ui~='delivery-context']:whitespace-normal max-[37.5rem]:text-[9px] max-[32.5rem]:in-data-[ui~='endpoint-row']:col-1 max-[32.5rem]:in-data-[ui~='endpoint-row']:row-2",
    tone && tones[tone],
    className,
  )} />;
}
