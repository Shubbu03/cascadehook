"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

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
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return (
    <details
      ref={details}
      className="workspace-switcher"
      name="workspace-navigation"
      onClick={(event) => {
        if ((event.target as Element).closest("a, [data-close-dropdown]")) close();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary className="switcher-trigger" aria-label={label}>
        {trigger}
        <CaretDownIcon className="switcher-caret" size={14} aria-hidden="true" />
      </summary>
      <div className="switcher-panel">{children}</div>
    </details>
  );
}
