import type { ComponentProps } from "react";
import { cn } from "@/lib/classes";

const variants = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover [[data-ui~='invitation-dialog']_[data-ui~='form-actions']_&]:min-w-33",
  secondary: "border-input-border bg-surface hover:bg-surface-hover",
  quiet: "bg-transparent text-foreground hover:bg-surface-hover",
  danger: "bg-danger text-accent-foreground hover:brightness-94",
};

type ButtonStyleProps = {
  variant?: keyof typeof variants;
  size?: "default" | "small";
  className?: string;
};

export function buttonStyles({
  variant = "primary",
  size = "default",
  className,
}: ButtonStyleProps = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2.5 rounded-[7px] border border-transparent font-medium text-center no-underline transition-colors duration-140 ease-[ease] motion-reduce:transition-none",
    size === "small"
      ? "min-h-9.5 px-3 py-2 text-[13px] leading-[1.4]"
      : "min-h-11.5 px-4.75 py-2.75 text-sm/[1.4]",
    "in-data-[ui~='dashboard-shell']:min-h-9 in-data-[ui~='dashboard-shell']:gap-1.75 in-data-[ui~='dashboard-shell']:rounded-md in-data-[ui~='dashboard-shell']:px-3 in-data-[ui~='dashboard-shell']:py-1.75 in-data-[ui~='dashboard-shell']:text-[13px]/5",
    "in-data-[ui~='notification-feed-compact']:min-h-7.5 in-data-[ui~='notification-feed-compact']:px-1.75 in-data-[ui~='notification-feed-compact']:py-1 in-data-[ui~='notification-feed-compact']:text-[11px]",
    size === "small" && "pointer-coarse:min-h-11",
    "pointer-coarse:in-data-[ui~='dashboard-shell']:min-h-11",
    "in-data-[ui~='connection-error']:justify-self-start [[data-ui~='endpoint-toolbar']_>_&]:ml-auto in-data-[ui~='endpoint-dialog-heading']:shrink-0 in-data-[ui~='endpoint-dialog-heading']:p-2 [[data-ui~='endpoint-danger']_>_&]:shrink-0 [[data-ui~='endpoint-danger']_>_&]:border-border in-data-[ui~='onboarding-card']:w-full in-data-[ui~='onboarding-card']:mt-1.5 [[data-ui~='deletion-form']_>_&]:shrink-0 [[data-ui~='deletion-form']_>_&]:min-h-10 [[data-ui~='deletion-form']_>_&]:whitespace-nowrap in-data-[ui~='event-publish-heading']:shrink-0 in-data-[ui~='event-publish-heading']:p-2 [[data-ui~='endpoint-danger']_>_&:hover]:bg-danger-subtle [[data-ui~='endpoint-danger']_>_&:hover]:border-danger [[data-ui~='dashboard-main']_[data-ui~='empty-state']_&]:mt-1 [[data-ui~='dashboard-main']_[data-ui~='deletion-form']_>_&]:min-h-10 [[data-ui~='dashboard-main']_[data-ui~='danger-zone-action']_>_&]:min-h-10 [[data-ui~='invitation-dialog']_[data-ui~='form-actions']_&]:min-h-9.5 [[data-ui~='invitation-dialog']_[data-ui~='form-actions']_&]:text-[13px] max-[32.5rem]:[[data-ui~='endpoint-toolbar']_>_&]:ml-0",
    variants[variant],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & ButtonStyleProps;

export function Button({
  variant,
  size,
  className,
  type,
  "data-ui": dataUi,
  ...props
}: ButtonProps & { "data-ui"?: string; }) {
  return (
    <button
      {...props}
      type={type}
      data-ui={["button", dataUi].filter(Boolean).join(" ")}
      className={buttonStyles({ variant, size, className })}
    />
  );
}
