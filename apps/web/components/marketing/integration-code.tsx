"use client";

import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CopyButton } from "@/components/copy-button";
import { cascadePulseEvent } from "@/components/marketing/story/cascade-track";
import { sleep, useCountUp, useInView, usePrefersReducedMotion } from "@/components/marketing/story/hooks";
import { storyEndpoints, storyEvent } from "@/features/marketing/story";
import { publicationExamples } from "@/lib/example";

type Phase = "idle" | "sending" | "sent";

function CodeLine({ line, marked, delay }: { line: string; marked: boolean; delay: number }) {
  return (
    <span style={{ animationDelay: `${delay}ms` }}
      className={`block motion-safe:group-data-[visible=true]/code:animate-code-line ${marked ? "-mx-2 rounded-[5px] bg-accent-subtle px-2 text-foreground" : ""}`}>
      {line || " "}
    </span>
  );
}

export function IntegrationCode() {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  const inView = useInView(card, 0.5);
  const reduced = usePrefersReducedMotion();
  const [language, setLanguage] = useState<(typeof publicationExamples)[number]["id"]>("curl");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sends, setSends] = useState(0);
  const selected = publicationExamples.find((example) => example.id === language)!;
  const shown = reduced || phase === "sent";
  const deliveries = useCountUp(shown ? storyEndpoints.length : 0, 700);

  async function send() {
    if (phase === "sending") return;
    setPhase("sending");
    await sleep(reduced ? 0 : 550);
    setSends((count) => count + 1);
    setPhase("sent");
    window.dispatchEvent(new CustomEvent(cascadePulseEvent, { detail: { from: "how-it-works" } }));
  }

  useEffect(() => {
    if (!inView || reduced || sends > 0) return;
    const timer = setTimeout(() => void send(), 500);
    return () => clearTimeout(timer);
    // Send once, the first time the card is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced]);

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

  const response = [
    "{",
    `  "id": "${storyEvent.id}",`,
    `  "type": "${storyEvent.type}",`,
    `  "created_at": "2026-11-24T${storyEvent.publishedAt}.104Z",`,
    `  "delivery_count": ${deliveries}`,
    "}",
  ];

  return (
    <div ref={card} className="group/code min-w-0 rounded-[14px] bg-surface overflow-clip border border-solid border-border transition-[border-color,box-shadow] duration-500 hover:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] group-data-[active=true]/chapter:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_22%,transparent),0_24px_60px_-34px_color-mix(in_srgb,var(--accent)_55%,transparent)] [&_pre]:overflow-x-auto [&_pre]:text-[11px] [&_pre]:leading-[1.95] [&_pre]:tab-2 [&_pre]:m-0 [&_pre]:py-6 [&_pre]:px-5 max-[37.5rem]:[&_pre]:px-3.75" data-motion="reveal">
      <div data-ui="landing-code-header" className="flex items-center justify-between flex-wrap pr-3 pl-4 border-b border-b-border text-muted text-[12px] gap-2 py-2.5 max-[37.5rem]:px-2.5">
        <div className={"flex items-center gap-1 [&_button]:min-h-9 [&_button]:rounded-[5px] [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:py-1.75 [&_button]:px-3 [&_button]:border-0 [&_button]:border-none [&_button]:border-current max-[37.5rem]:[&_button]:px-2.5 pointer-coarse:[&_button]:min-h-11 [&_button[aria-selected='true']]:bg-surface-hover [&_button[aria-selected='true']]:text-foreground"} role="tablist" aria-label="Request language" onKeyDown={navigate}>
          {publicationExamples.map((example) => (
            <button key={example.id} type="button" role="tab" id={`${id}-${example.id}`} data-language={example.id}
              aria-controls={`${id}-panel`} aria-selected={example.id === language} tabIndex={example.id === language ? 0 : -1}
              onClick={() => setLanguage(example.id)}>
              {example.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <CopyButton key={language} value={selected.code} label="Copy request" />
          <button type="button" onClick={() => void send()} disabled={phase === "sending"}
            className="inline-flex min-h-9 items-center gap-2 rounded-[7px] bg-foreground px-3.5 text-[12px] font-medium text-background transition-[transform,opacity] duration-150 active:scale-[0.95] disabled:opacity-70 motion-reduce:transition-none pointer-coarse:min-h-11">
            <PaperPlaneTiltIcon size={14} aria-hidden="true" className={phase === "sending" ? "motion-safe:animate-pulse" : undefined} />
            {phase === "sending" ? "Sending" : sends > 0 ? "Send again" : "Send"}
          </button>
        </div>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}`} tabIndex={0}>
        <pre><code>{selected.code.split("\n").map((line, index) => (
          <CodeLine key={`${language}-${index}`} line={line} marked={line.includes("Idempotency-Key")} delay={index * 35} />
        ))}</code></pre>
      </div>
      <div className="border-t border-t-border" aria-live="polite">
        <div className="flex min-h-10 items-center flex-wrap pt-4 text-muted text-[12px] gap-x-3 gap-y-1 px-5 max-[37.5rem]:px-3.75">
          {shown ? (
            <>
              <span key={sends} className="inline-block font-mono text-[11px] text-success motion-safe:animate-status-pop">202 Accepted</span>
              {sends > 1
                ? <span><code className="text-foreground text-[11px]">Idempotent-Replay: true</code>, the same event came back and nothing was duplicated.</span>
                : <span>Stored and fanned out in one transaction</span>}
            </>
          ) : phase === "sending" ? (
            <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />Sending to /v1/events</span>
          ) : (
            <span>Press Send to publish this event.</span>
          )}
        </div>
        <pre key={sends} className={`pt-3! pb-5! transition-opacity duration-300 ${shown ? "" : "opacity-35"}`}><code>
          {response.map((line, index) => (
            <span key={index} style={{ animationDelay: `${index * 70}ms` }}
              className={`block ${shown && sends > 0 ? "motion-safe:animate-code-line" : ""} ${line.includes("delivery_count") ? "-mx-2 rounded-[5px] bg-accent-subtle px-2 text-foreground" : ""}`}>
              {line}
            </span>
          ))}
        </code></pre>
      </div>
    </div>
  );
}
