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
    <div className="landing-code-example" data-motion="reveal">
      <div className="landing-code-header">
        <div className="landing-code-tabs" role="tablist" aria-label="Request language" onKeyDown={navigate}>
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
      <div className="landing-code-footer"><span>202 Accepted</span>Queued for delivery</div>
      <p className="landing-code-note">Replace the API host and project key with your own.</p>
    </div>
  );
}
