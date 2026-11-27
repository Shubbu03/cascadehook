"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deliveryLimits, retryJitterPercent } from "@/features/marketing/limits";
import { retryHorizonLabel, retrySchedule } from "@/features/marketing/story";
import { storyCard } from "./fan-out";
import { useInView, usePrefersReducedMotion } from "./hooks";

const outages = [
  { label: "1 minute", seconds: 60 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86_400 },
  { label: "4 days", seconds: 345_600 },
];

const horizon = deliveryLimits.windowHours * 3600;
const scale = Math.log10(1 + horizon / retrySchedule[1].offset);
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
// Inverse of the log placement in story.ts, so the clock reads real elapsed time at the playhead.
const secondsAt = (position: number) => retrySchedule[1].offset * (10 ** (position * scale) - 1);

function clock(seconds: number) {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  if (total < 86_400) return `${Math.floor(total / 3600)}h ${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(total / 86_400)}d ${Math.floor((total % 86_400) / 3600)}h`;
}

function outcome(outageSeconds: number) {
  return retrySchedule.find((step) => step.offset >= outageSeconds)?.attempt ?? null;
}

export function RetryTimeline() {
  const figure = useRef<HTMLElement>(null);
  const inView = useInView(figure, 0.4);
  const reduced = usePrefersReducedMotion();
  const [outage, setOutage] = useState(0);
  const [position, setPosition] = useState(1);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const started = useRef(false);

  const success = outcome(outages[outage].seconds);
  const end = success ? retrySchedule[success - 1].position : 1;
  const head = Math.min(position, end);
  const reached = retrySchedule.filter((step) => step.position <= head + 0.0001).length;

  const play = useCallback((target: number) => {
    cancelAnimationFrame(frame.current);
    if (reduced) {
      setPosition(1);
      setPlaying(false);
      return;
    }
    const duration = 900 + target * 3200;
    const start = performance.now();
    setPlaying(true);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setPosition(target * progress);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  }, [reduced]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    if (!inView || started.current || reduced) return;
    started.current = true;
    const timer = setTimeout(() => play(end), 300);
    return () => clearTimeout(timer);
  }, [inView, reduced, play, end]);

  function choose(index: number) {
    setOutage(index);
    const next = outcome(outages[index].seconds);
    play(next ? retrySchedule[next - 1].position : 1);
  }

  function tone(attempt: number) {
    if (attempt > reached) return success !== null && attempt > success ? "border-border bg-surface opacity-50" : "border-border bg-surface";
    return attempt === success ? "border-success bg-success" : "border-danger bg-danger";
  }

  const finished = !playing && reached === (success ?? retrySchedule.length);

  return (
    <figure ref={figure} className={`p-7 max-[53.125rem]:p-5.5 max-[37.5rem]:p-4 ${storyCard}`} data-motion="reveal">
      <figcaption>
        <div className="flex flex-wrap items-center gap-2 text-[12px]" role="group" aria-label="How long the endpoint is down">
          <span className="mr-1 text-muted">If the endpoint is down for</span>
          {outages.map((option, index) => (
            <button key={option.label} type="button" aria-pressed={outage === index} onClick={() => choose(index)}
              className="min-h-9 rounded-full border border-solid border-border px-3.5 font-mono text-[11px] text-muted transition-[background-color,color,transform] duration-150 hover:text-foreground active:scale-[0.95] aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background pointer-coarse:min-h-11">
              {option.label}
            </button>
          ))}
        </div>
      </figcaption>

      <div className="relative mt-12 h-24 max-[53.125rem]:mt-6 max-[53.125rem]:h-auto">
        <span aria-hidden="true" className="absolute top-1/2 right-0 left-0 border-t border-dashed border-border max-[53.125rem]:hidden" />
        <span aria-hidden="true" className={`absolute top-1/2 left-0 h-0.5 -translate-y-px ${success ? "bg-success/70" : "bg-danger/70"} max-[53.125rem]:hidden`} style={{ width: percent(head) }} />
        <span aria-hidden="true" className="absolute -top-8 z-1 rounded-full bg-foreground px-2.5 py-1 font-mono text-[11px] whitespace-nowrap text-background tabular-nums max-[53.125rem]:hidden" style={{ left: percent(head), transform: `translateX(${-head * 100}%)` }}>
          +{clock(secondsAt(head))}
        </span>
        <span aria-hidden="true" className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground/50 max-[53.125rem]:hidden" style={{ left: percent(head) }} />
        <ol className="m-0 list-none p-0 max-[53.125rem]:ml-1 max-[53.125rem]:grid max-[53.125rem]:gap-4 max-[53.125rem]:border-l max-[53.125rem]:border-dashed max-[53.125rem]:border-border max-[53.125rem]:pl-5">
          {retrySchedule.map((step) => (
            <li key={step.attempt} style={{ left: percent(step.position) }}
              className={`min-[53.125rem]:absolute min-[53.125rem]:top-0 min-[53.125rem]:flex min-[53.125rem]:h-full min-[53.125rem]:-translate-x-1/2 min-[53.125rem]:flex-col min-[53.125rem]:items-center min-[53.125rem]:justify-between max-[53.125rem]:relative max-[53.125rem]:grid max-[53.125rem]:grid-cols-[auto_minmax(0,1fr)_auto] max-[53.125rem]:items-center max-[53.125rem]:gap-3 ${step.attempt > reached ? "text-muted" : ""}`}>
              <span className="font-mono text-[11px] max-[53.125rem]:order-2">#{step.attempt}</span>
              <span aria-hidden="true" key={step.attempt <= reached ? "on" : "off"}
                className={`size-3 rounded-full border border-solid transition-colors max-[53.125rem]:order-1 max-[53.125rem]:-ml-[26.5px] ${tone(step.attempt)} ${step.attempt <= reached ? "motion-safe:animate-status-pop" : ""}`} />
              <span className="font-mono text-[11px] text-muted whitespace-nowrap max-[53.125rem]:order-3">{step.label}</span>
            </li>
          ))}
        </ol>
        <span className="absolute top-0 right-0 flex h-full flex-col items-end justify-between font-mono text-[11px] text-muted max-[53.125rem]:hidden">
          <span>cutoff</span>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <span>{retryHorizonLabel}</span>
        </span>
      </div>

      <p aria-live="polite" className="mt-8 min-h-6 text-[14px] leading-[1.7] max-[53.125rem]:mt-5">
        {!finished ? (
          <span className="text-muted">Attempt {Math.max(1, reached)} of {retrySchedule.length}…</span>
        ) : success ? (
          <><span className="text-success">Delivered on attempt {success}</span>, {retrySchedule[success - 1].label === "now" ? "right away" : `${retrySchedule[success - 1].label.slice(1)} after the first try`}.</>
        ) : (
          <><span className="text-danger">All {retrySchedule.length} attempts failed.</span> The delivery is marked failed, and you can replay it once the endpoint is back.</>
        )}
      </p>
      <p className="mt-1 text-muted text-[12px]">Default schedule. Each wait varies by ±{retryJitterPercent}% so retries from many deliveries don&apos;t arrive at once.</p>

      <dl className="mt-6 grid grid-cols-3 gap-6 border-t border-dashed border-border pt-5 text-[12px] leading-[1.7] max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-4 [&_dt]:font-medium [&_dd]:mt-1 [&_dd]:text-muted">
        <div><dt>Retried</dt><dd>Timeouts, network errors, and 408, 429, and 5xx responses.</dd></div>
        <div><dt>Not retried</dt><dd>Redirects and other 4xx responses. The delivery fails right away, and you can replay it.</dd></div>
        <div><dt>Retry-After</dt><dd>Respected when an endpoint sends it, up to the {deliveryLimits.windowHours}-hour cutoff.</dd></div>
      </dl>
    </figure>
  );
}
