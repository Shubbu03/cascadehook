"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

// Inactive panels stay in the server-rendered HTML (only hidden), so the
// reference content remains readable to search engines and find-in-page.
export function ReferenceTabs({ label, tabs }: { label: string; tabs: { id: string; label: string; content: ReactNode }[]; }) {
  const id = useId();
  const [active, setActive] = useState(tabs[0].id);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex((tab) => tab.id === active);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActive(tabs[next].id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={navigate} className="flex flex-wrap gap-1 border-b border-b-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-${tab.id}-tab`}
            data-tab={tab.id}
            aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={tab.id === active}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => setActive(tab.id)}
            className="-mb-px min-h-11 border-0 border-b-2 border-solid border-b-transparent bg-transparent px-3.5 text-[14px] text-muted hover:text-foreground aria-selected:border-b-accent aria-selected:text-foreground"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`${id}-${tab.id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab.id}-tab`} hidden={tab.id !== active} tabIndex={0} className="pt-6 focus-visible:outline-offset-4">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
