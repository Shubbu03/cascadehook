import type { ComponentProps } from "react";

type SelectProps = Omit<ComponentProps<"select">, "multiple" | "size">;

export function Select({ children, className, ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={className ? "select-control " + className : "select-control"}
    >
      {children}
    </select>
  );
}
