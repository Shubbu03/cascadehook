import { cn } from "@/lib/classes";

export function PageHeader({
  title,
  titleId,
  description,
  actions,
  variant = "default",
}: {
  title: React.ReactNode;
  titleId?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "default" | "endpoint" | "delivery";
}) {
  return (
    <header className={cn(
      "mb-6 flex flex-wrap items-center justify-between gap-3.5 max-[37.5rem]:mb-5 max-[37.5rem]:items-start max-[37.5rem]:gap-3",
      variant === "endpoint" && "mb-5 gap-x-6 gap-y-3 @max-[38.75rem]/endpoint-settings:mb-4 @max-[38.75rem]/endpoint-settings:items-start",
      variant === "delivery" && "mb-4.5",
    )}>
      <div className="min-w-0">
        <h1 id={titleId} className="text-2xl/tight tracking-[-0.035em] wrap-anywhere max-[37.5rem]:text-[22px]">{title}</h1>
        {description && (
          <div className={cn("mt-1.75 text-[13px] leading-[1.7] text-muted wrap-anywhere [&_code]:text-[11px]", variant === "delivery" && "mt-1")}>{description}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-[37.5rem]:gap-2">{actions}</div>}
    </header>
  );
}
