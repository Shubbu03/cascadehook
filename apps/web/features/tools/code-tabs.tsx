"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/copy-button";

export type Snippet = { id: string; label: string; note: string; code: string };

export function CodeTabs({ snippets }: { snippets: Snippet[] }) {
  const id = useId();
  const [language, setLanguage] = useState(snippets[0].id);
  const selected = snippets.find((snippet) => snippet.id === language)!;

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = snippets.findIndex((snippet) => snippet.id === language);
    const next = event.key === "Home" ? 0 : event.key === "End" ? snippets.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + snippets.length) % snippets.length;
    setLanguage(snippets[next].id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-language="${snippets[next].id}"]`)?.focus();
  }

  return (
    <div className="min-w-0 rounded-[14px] bg-surface overflow-clip border border-solid border-border">
      <div data-ui="landing-code-header" className="flex items-center justify-between flex-wrap pr-3 pl-4 border-b border-b-border text-muted text-[12px] gap-2 py-2.5 max-[37.5rem]:px-2.5">
        <div className="flex items-center gap-1 [&_button]:min-h-9 [&_button]:rounded-[5px] [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:py-1.75 [&_button]:px-3 [&_button]:border-0 max-[37.5rem]:[&_button]:px-2.5 pointer-coarse:[&_button]:min-h-11 [&_button[aria-selected='true']]:bg-surface-hover [&_button[aria-selected='true']]:text-foreground" role="tablist" aria-label="Language" onKeyDown={navigate}>
          {snippets.map((snippet) => (
            <button key={snippet.id} type="button" role="tab" id={`${id}-${snippet.id}`} data-language={snippet.id}
              aria-controls={`${id}-panel`} aria-selected={snippet.id === language} tabIndex={snippet.id === language ? 0 : -1}
              onClick={() => setLanguage(snippet.id)}>
              {snippet.label}
            </button>
          ))}
        </div>
        <CopyButton key={language} value={selected.code} label="Copy code" />
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}`} tabIndex={0}>
        <pre className="m-0 overflow-x-auto px-5 py-6 text-[12px] leading-[1.85] tab-4 max-[37.5rem]:px-3.75"><code>{selected.code}</code></pre>
      </div>
      <p className="border-t border-t-border px-5 py-3.5 text-muted text-[12px] leading-[1.6] max-[37.5rem]:px-3.75">{selected.note}</p>
    </div>
  );
}
