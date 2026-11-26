"use client";

import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRef } from "react";
import { hiddenSteps, storyDelivery, storyEvent, tripSteps, tripTotals } from "@/features/marketing/story";
import { storyCard } from "./fan-out";
import { useCountUp, useInView, usePrefersReducedMotion } from "./hooks";

function Total({ value, label, suffix = "", show }: { value: number; label: string; suffix?: string; show: boolean }) {
  const shown = useCountUp(show ? value : 0, 900);
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2">
      <dt className="text-muted text-[12px]">{label}</dt>
      <dd className="m-0 font-mono text-[30px] leading-none tracking-[-0.03em] tabular-nums max-[37.5rem]:text-[24px]">{shown}{suffix}</dd>
    </div>
  );
}

// The line's last node sits on this card's top edge, so the travelling event lands here.
export function Receipt() {
  const card = useRef<HTMLDivElement>(null);
  const inView = useInView(card, 0.3);
  const reduced = usePrefersReducedMotion();
  const show = inView || reduced;

  return (
    <div ref={card} className={`relative ${storyCard}`}>
      <span data-cascade-node="end" aria-hidden="true"
        className="absolute top-0 left-1/2 z-1 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-solid border-accent bg-background transition-[background-color,box-shadow] duration-500 group-data-[active=true]/finale:bg-accent group-data-[active=true]/finale:shadow-[0_0_0_7px_color-mix(in_srgb,var(--accent)_20%,transparent)]" />

      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-8 border-b border-solid border-border p-8 max-[53.125rem]:p-6 max-[37.5rem]:p-5">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-success text-[13px]">
            <span className="size-2 rounded-full bg-success group-data-[active=true]/finale:motion-safe:animate-status-pop" aria-hidden="true" />
            Delivered at {tripSteps[tripSteps.length - 1].at} UTC
          </p>
          <h2 id="everything-heading" className="mt-4 max-w-150 text-[clamp(28px,3.2vw,40px)] font-normal leading-[1.16] tracking-[-0.045em] text-balance max-[37.5rem]:text-[27px]">
            That&apos;s the whole trip, <span className="text-accent">from publish to delivered.</span>
          </h2>
          <code className="mt-3 block truncate text-muted text-[11px]">{storyEvent.type} · event {storyEvent.id} · delivery {storyDelivery.id}</code>
        </div>
        <dl className="grid grid-cols-4 gap-x-10 gap-y-5 max-[53.125rem]:grid-cols-2 max-[53.125rem]:gap-x-8">
          <Total value={tripTotals.events} label="event published" show={show} />
          <Total value={tripTotals.deliveries} label="deliveries" show={show} />
          <Total value={tripTotals.attempts} label="attempts" show={show} />
          <Total value={tripTotals.seconds} suffix="s" label="end to end" show={show} />
        </dl>
      </div>

      <div className="grid grid-cols-2 max-[53.125rem]:grid-cols-[minmax(0,1fr)]">
        <section aria-labelledby="trip-heading" className="p-8 max-[53.125rem]:p-6 max-[37.5rem]:p-5">
          <h3 id="trip-heading" className="text-muted text-[12px]">The trip, in this story</h3>
          <ol className="mt-3 mb-0 list-none p-0">
            {tripSteps.map((step) => (
              <li key={step.chapter}>
                <a href={step.href} className="group/step -mx-3 grid grid-cols-[4.25rem_2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-3 text-[14px] transition-colors duration-150 hover:bg-surface-hover max-[37.5rem]:grid-cols-[3.75rem_1.75rem_minmax(0,1fr)] max-[37.5rem]:text-[13px]">
                  <span className="font-mono text-[11px] text-muted">{step.at}</span>
                  <span className="font-mono text-[11px] text-accent">{step.chapter}</span>
                  <span>{step.text}</span>
                  <ArrowRightIcon size={14} aria-hidden="true" className="-translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover/step:translate-x-0 group-hover/step:opacity-100 max-[37.5rem]:hidden" />
                </a>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="unseen-heading" className="border-l border-solid border-border p-8 max-[53.125rem]:border-t max-[53.125rem]:border-l-0 max-[53.125rem]:p-6 max-[37.5rem]:p-5">
          <h3 id="unseen-heading" className="text-muted text-[12px]">Also handled on the way, out of sight</h3>
          <ul className="mt-3 mb-0 grid list-none gap-1 p-0">
            {hiddenSteps.map((text, index) => (
              <li key={text} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2.5 py-2 text-[14px] leading-[1.65] max-[37.5rem]:text-[13px]">
                <span style={{ animationDelay: `${300 + index * 180}ms` }}
                  className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-border text-muted transition-colors duration-500 group-data-[active=true]/finale:bg-success-subtle group-data-[active=true]/finale:text-success group-data-[active=true]/finale:motion-safe:animate-status-pop">
                  <CheckIcon size={11} weight="bold" aria-hidden="true" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-dashed border-border px-8 py-5 text-[13px] max-[53.125rem]:px-6 max-[37.5rem]:px-5">
        <p className="text-muted">Building this yourself means owning every line on this receipt.</p>
        <Link href="/compare" className="inline-flex min-h-11 items-center gap-2 text-accent hover:underline hover:underline-offset-4">
          Compare with Svix, Hookdeck, Convoy, and building it yourself <ArrowRightIcon size={15} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
