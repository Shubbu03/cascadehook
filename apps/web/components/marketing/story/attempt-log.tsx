"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { deliveryLimits } from "@/features/marketing/limits";
import { storyAttempts, storyDelivery, storyEvent } from "@/features/marketing/story";
import { storyCard } from "./fan-out";
import { sleep, usePrefersReducedMotion } from "./hooks";

const row = "grid grid-cols-[4.5rem_6rem_minmax(0,1fr)_4.5rem_minmax(0,8rem)] items-center gap-4 px-5 max-[53.125rem]:grid-cols-[3.75rem_minmax(0,1fr)_auto] max-[53.125rem]:gap-x-3 max-[37.5rem]:px-4";
const replayAttempt = { at: "11:06:41", status: 200, label: "OK", duration: 77, next: "Delivered" };

type Attempt = (typeof storyAttempts)[number];
type Phase = "idle" | "sending" | "done";

function AttemptRow({ attempt, number, fresh = false }: { attempt: Attempt; number: number; fresh?: boolean }) {
  const delivered = attempt.status < 300;
  return (
    <div role="row" className={`${row} min-h-12.5 border-b border-dashed border-border py-2.5 ${fresh ? "motion-safe:animate-row-in" : ""}`}>
      <span role="cell" className="text-muted">#{number}</span>
      <span role="cell" className="font-mono text-[11px] text-muted max-[53.125rem]:hidden">{attempt.at}</span>
      <span role="cell" className="inline-flex min-w-0 items-center gap-2.5">
        <span className={`size-1.75 shrink-0 rounded-full ${delivered ? "bg-success" : "bg-danger"} ${fresh ? "motion-safe:animate-status-pop" : ""}`} aria-hidden="true" />
        <code className={`truncate text-[11px] ${delivered ? "text-success" : ""}`}>{attempt.status} {attempt.label}</code>
      </span>
      <span role="cell" className="font-mono text-[11px] text-muted max-[53.125rem]:text-right">{attempt.duration} ms</span>
      <span role="cell" className="text-muted max-[53.125rem]:hidden">{attempt.next}</span>
    </div>
  );
}

export function AttemptLog() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");

  async function replay() {
    if (phase !== "idle") {
      setPhase("idle");
      return;
    }
    setPhase("sending");
    await sleep(reduced ? 0 : 900);
    setPhase("done");
  }

  return (
    <figure className={`overflow-hidden ${storyCard}`} data-motion="reveal">
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-solid border-border px-5 py-4 max-[37.5rem]:px-4">
        <span className="min-w-0">
          <code className="block text-[13px]">{storyEvent.type} <span className="mx-1 text-muted" aria-hidden="true">→</span> {storyDelivery.path}</code>
          <code className="mt-1 block truncate text-muted text-[11px]">delivery {storyDelivery.id}</code>
        </span>
        <span key={phase} aria-live="polite" className={`rounded-full px-2.5 py-1 text-[11px] motion-safe:animate-status-pop ${phase === "sending" ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"}`}>
          {phase === "sending" ? "Replaying" : phase === "done" ? "Succeeded · cycle 2" : "Succeeded"}
        </span>
      </figcaption>
      <div role="table" aria-label="Delivery attempts" className="text-[12px]">
        <div role="row" className={`${row} border-b border-solid border-border py-2.5 text-muted text-[11px] max-[53.125rem]:hidden`}>
          <span role="columnheader">Attempt</span>
          <span role="columnheader">Time (UTC)</span>
          <span role="columnheader">Response</span>
          <span role="columnheader">Duration</span>
          <span role="columnheader">Next</span>
        </div>
        <div role="row" className="px-5 pt-3 pb-1 text-muted text-[11px] max-[37.5rem]:px-4"><span role="cell">Cycle 1</span></div>
        {storyAttempts.map((attempt, index) => <AttemptRow key={attempt.at} attempt={attempt} number={index + 1} />)}
        {phase !== "idle" && (
          <div role="row" className="motion-safe:animate-row-in px-5 pt-3 pb-1 text-[11px] text-accent max-[37.5rem]:px-4">
            <span role="cell">Cycle 2 · fresh {deliveryLimits.windowHours}-hour window</span>
          </div>
        )}
        {phase === "sending" && (
          <div role="row" className={`${row} min-h-12.5 border-b border-dashed border-border py-2.5 motion-safe:animate-row-in`}>
            <span role="cell" className="text-muted">#1</span>
            <span role="cell" className="inline-flex items-center gap-2 text-muted max-[53.125rem]:col-span-2">
              <span className="size-1.75 rounded-full bg-warning motion-safe:animate-pulse" aria-hidden="true" />Sending…
            </span>
          </div>
        )}
        {phase === "done" && <AttemptRow attempt={replayAttempt} number={1} fresh />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4.5 max-[37.5rem]:px-4">
        <button type="button" onClick={() => void replay()} disabled={phase === "sending"}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-solid border-input-border px-3 text-[12px] transition-[transform,background-color] duration-150 hover:bg-surface-hover active:scale-[0.95] disabled:opacity-60 pointer-coarse:min-h-11">
          <ArrowCounterClockwiseIcon size={14} aria-hidden="true" className={phase === "sending" ? "motion-safe:animate-spin" : undefined} />
          {phase === "done" ? "Reset" : "Replay"}
        </button>
        <p className="min-w-0 flex-1 text-muted text-[12px] leading-[1.7]">
          {phase === "done"
            ? "Cycle 2 got its own attempts and its own window. Cycle 1 is untouched."
            : `Replay starts cycle 2 with a fresh ${deliveryLimits.windowHours}-hour window. Cycle 1's attempts stay exactly as they are.`}
        </p>
      </div>
      <p className="border-t border-dashed border-border px-5 py-3.5 text-muted text-[11px] leading-[1.7] max-[37.5rem]:px-4">
        Each attempt keeps its status, timing, and error type. Response bodies are never stored.
      </p>
    </figure>
  );
}
