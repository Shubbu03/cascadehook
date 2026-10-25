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
      className="workspace-switcher"
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
      <summary className="switcher-trigger" aria-label={label}>
        {trigger}
        <CaretDownIcon
          className="switcher-caret"
          size={14}
          aria-hidden="true"
        />
      </summary>
      <div ref={panel} className="switcher-panel">
        {children}
      </div>
    </details>
  );
}
