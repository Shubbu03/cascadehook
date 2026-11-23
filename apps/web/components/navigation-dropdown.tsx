"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";

export function NavigationDropdown({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const alignPanel = useCallback(() => {
    const element = details.current;
    const popup = panel.current;
    const trigger = element?.querySelector("summary");
    if (!element?.open || !popup || !trigger) return;
    const { left, bottom } = trigger.getBoundingClientRect();
    const width = popup.getBoundingClientRect().width;
    popup.style.left =
      Math.max(12, Math.min(left, window.innerWidth - width - 12)) + "px";
    popup.style.top = bottom + 8 + "px";
    popup.style.maxHeight =
      Math.max(0, window.innerHeight - bottom - 20) + "px";
  }, []);

  function close() {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus();
  }

  useEffect(() => {
    const element = details.current;
    function outside(event: PointerEvent) {
      if (element?.open && !element.contains(event.target as Node)) {
        element.open = false;
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && element?.open) {
        event.preventDefault();
        element.open = false;
        element.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", alignPanel);
    window.addEventListener("scroll", alignPanel, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", alignPanel);
      window.removeEventListener("scroll", alignPanel, true);
    };
  }, [alignPanel]);

  return (
    <details
      ref={details}
      data-ui="workspace-switcher" className="relative min-w-0 max-[56.25rem]:in-data-[ui~='dashboard-topbar']:min-w-0 max-[56.25rem]:in-data-[ui~='dashboard-topbar']:flex-[1_1_0] max-[37.5rem]:[[data-ui~='dashboard-topbar']_&:first-child]:flex-[0_0_auto]"
      name="workspace-navigation"
      onToggle={alignPanel}
      onClick={(event) => {
        if ((event.target as Element).closest("a, [data-close-dropdown]"))
          close();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary className="flex items-center min-h-11 rounded-lg list-none text-[14px] [user-select:none] [transition:background-color_0.15s] gap-2.5 py-1.5 px-2.5 [&::-webkit-details-marker]:hidden [&:hover]:bg-surface-hover in-data-[ui~='dashboard-topbar']:min-h-9 in-data-[ui~='dashboard-topbar']:text-[13px] in-data-[ui~='dashboard-topbar']:gap-2 in-data-[ui~='dashboard-topbar']:py-1 in-data-[ui~='dashboard-topbar']:px-2 [[data-ui~='workspace-switcher'][open]_>_&]:bg-surface-hover max-[37.5rem]:text-[13px] max-[37.5rem]:px-1.5 max-[37.5rem]:gap-1.75 max-[37.5rem]:in-data-[ui~='dashboard-topbar']:gap-1.5 max-[37.5rem]:in-data-[ui~='dashboard-topbar']:px-1.25 pointer-coarse:in-data-[ui~='dashboard-topbar']:min-h-11" aria-label={label}>
        {trigger}
        <CaretDownIcon
          className="shrink-0 ml-0.75 text-muted"
          size={14}
          aria-hidden="true"
        />
      </summary>
      <div ref={panel} className="fixed z-50 top-17 left-3 [width:320px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-xl bg-surface shadow-floating p-1.5 border border-solid border-border max-[37.5rem]:in-data-[ui~='dashboard-topbar']:w-[calc(100vw-24px)] max-[37.5rem]:in-data-[ui~='dashboard-topbar']:max-w-none">
        {children}
      </div>
    </details>
  );
}
