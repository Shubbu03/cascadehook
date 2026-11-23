"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/classes";

export function SettingsTabs({ sections }: {
  sections: { id: string; label: string; content: ReactNode }[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = sections.find((section) => section.id === params.get("section")) ?? sections[0];
  return (
    <div className="max-w-260">
      <nav aria-label="Settings sections" className="mb-7 flex flex-wrap gap-x-6 gap-y-1 border-b border-border">
        {sections.map((section) => {
          const query = new URLSearchParams(params);
          query.set("section", section.id);
          return (
            <Link key={section.id} href={pathname + "?" + query.toString()} scroll={false}
              aria-current={selected.id === section.id ? "page" : undefined}
              className="-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent py-2 text-[13px] font-medium text-muted transition-colors hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:text-accent motion-reduce:transition-none">
              {section.label}
            </Link>
          );
        })}
      </nav>
      <div key={selected.id}>{selected.content}</div>
    </div>
  );
}

export function SettingsSection({ title, description, children, danger = false }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mb-8">
      <div className="mb-4">
        <h2 id={id} className={cn("text-[17px] font-medium tracking-tight", danger && "text-danger")}>{title}</h2>
        {description && <div className="mt-1.5 max-w-180 text-[13px]/7 text-muted">{description}</div>}
      </div>
      <div className={cn("rounded-xl border bg-surface px-5 sm:px-6", danger ? "border-danger-subtle" : "border-border")}>
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({ title, description, children }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-border py-5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-60">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {description && <div className="mt-1 max-w-150 text-[12px]/6 text-muted">{description}</div>}
      </div>
      <div className="min-w-0 max-w-full shrink-0">{children}</div>
    </div>
  );
}

export function SettingsSwitch({ title, description, checked, disabled, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 border-b border-border py-5 last:border-b-0 has-disabled:cursor-default">
      <span className="min-w-0">
        <span id={id} className="block text-[13px] font-medium">{title}</span>
        <span id={id + "-description"} className="mt-1 block max-w-150 text-[12px]/6 text-muted">{description}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled}
        aria-labelledby={id} aria-describedby={id + "-description"}
        onChange={(event) => onChange(event.target.checked)}
        className="relative h-5.5 w-10 shrink-0 cursor-pointer appearance-none rounded-full border border-input-border bg-surface-hover transition-colors checked:border-accent checked:bg-accent after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-muted after:transition-transform checked:after:translate-x-4.5 checked:after:bg-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none motion-reduce:after:transition-none forced-colors:appearance-auto forced-colors:after:hidden" />
    </label>
  );
}
