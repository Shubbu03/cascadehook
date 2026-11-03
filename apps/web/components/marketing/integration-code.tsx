"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/copy-button";
import { publicationExamples } from "@/lib/example";

export function IntegrationCode() {
  const id = useId();
  const [language, setLanguage] = useState<(typeof publicationExamples)[number]["id"]>("curl");
  const selected = publicationExamples.find((example) => example.id === language)!;

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = publicationExamples.findIndex((example) => example.id === language);
    const next = event.key === "Home" ? 0 : event.key === "End" ? publicationExamples.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + publicationExamples.length) % publicationExamples.length;
    const example = publicationExamples[next];
    setLanguage(example.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-language="${example.id}"]`)?.focus();
  }

  return (
    <div className="min-w-0 rounded-[14px] bg-surface overflow-clip border border-solid border-border [&_pre]:overflow-x-auto [&_pre]:text-[11px] [&_pre]:leading-[1.95] [&_pre]:tab-2 [&_pre]:m-0 [&_pre]:py-6 [&_pre]:px-5 max-[37.5rem]:[&_pre]:px-3.75" data-motion="reveal">
      <div data-ui="landing-code-header" className="flex items-center justify-between flex-wrap pr-3 pl-4 border-b [border-bottom-style:solid] border-b-border text-muted text-[12px] gap-2 py-2.5 max-[37.5rem]:px-2.5">
        <div className={"flex items-center gap-1 [&_button]:min-h-9 [&_button]:rounded-[5px] [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:py-1.75 [&_button]:px-3 [&_button]:border-0 [&_button]:border-none [&_button]:border-current max-[37.5rem]:[&_button]:px-2.5 pointer-coarse:[&_button]:min-h-11 [&_button[aria-selected=\"true\"]]:bg-surface-hover [&_button[aria-selected=\"true\"]]:text-foreground"} role="tablist" aria-label="Request language" onKeyDown={navigate}>
          {publicationExamples.map((example) => (
            <button key={example.id} type="button" role="tab" id={`${id}-${example.id}`} data-language={example.id}
              aria-controls={`${id}-panel`} aria-selected={example.id === language} tabIndex={example.id === language ? 0 : -1}
              onClick={() => setLanguage(example.id)}>
              {example.label}
            </button>
          ))}
        </div>
        <CopyButton key={language} value={selected.code} label="Copy request" />
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}`} tabIndex={0}>
        <pre><code>{selected.code}</code></pre>
      </div>
      <div className="flex items-center flex-wrap pt-4 pb-2 border-t [border-top-style:solid] border-t-border text-muted text-[12px] gap-3 px-5 max-[37.5rem]:px-3.75 [&_>_span]:text-success [&_>_span]:font-mono [&_>_span]:text-[11px]"><span>202 Accepted</span>Queued for delivery</div>
      <p className="pt-0 pb-4.25 text-muted text-[11px] px-5 max-[37.5rem]:px-3.75">Replace the API host and project key with your own.</p>
    </div>
  );
}
