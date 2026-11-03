import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/classes";
import { controlStyles } from "./input";

type SelectProps = Omit<ComponentProps<"select">, "multiple" | "size">;

export function Select({ children, className, style, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={cn(
        controlStyles,
        "appearance-none bg-(image:--select-arrow) bg-position-[right_14px_center] bg-no-repeat bg-size-[14px_14px] pl-3.5 pr-10.5 font-normal text-start text-ellipsis disabled:opacity-60",
        "block w-full min-h-11 rounded-[7px] py-2.5 text-sm/normal text-foreground",
        "forced-colors:appearance-auto forced-colors:bg-none",
        className,
      )}
      style={{
        "--select-arrow": `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='m4 6 4 4 4-4' stroke='%23858991' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        ...style,
      } as CSSProperties}
    >
      {children}
    </select>
  );
}
