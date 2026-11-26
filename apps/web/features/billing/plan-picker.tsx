"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonStyles } from "@/components/button";
import { count } from "@/features/marketing/limits";
import { cn } from "@/lib/classes";
import { formatBytes } from "@/lib/format";
import { discountedPrice, plans, planPrice, type BillingInterval, type FoundingOffer, type Plan } from "@/lib/plans";
import { BillingIntervalPicker } from "./billing-interval";
import { billingStartHref } from "./intent";
import { planBlurbs } from "./pricing-content";
import { useFoundingOffer } from "./use-founding-offer";

function foundingTerm(offer: FoundingOffer) {
  return offer.months > 0 ? `for your first ${offer.months} months` : "for as long as you stay subscribed";
}

const featured = "starter";
const press = "transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none";

const allowances: { label: string; value: (plan: Plan) => string }[] = [
  { label: "Deliveries / month", value: (plan) => count(plan.limits.monthly_deliveries) },
  { label: "Events / month", value: (plan) => count(plan.limits.monthly_events) },
  { label: "Projects", value: (plan) => String(plan.limits.projects) },
  { label: "Members, including you", value: (plan) => String(plan.limits.members) },
  { label: "Endpoints / project", value: (plan) => String(plan.limits.endpoints_per_project) },
  { label: "API keys / project", value: (plan) => String(plan.limits.active_api_keys_per_project) },
  { label: "Delivery history", value: (plan) => `${plan.retention_days} days` },
  { label: "Stored payloads / project", value: (plan) => formatBytes(plan.limits.payload_bytes_per_project) },
];

export function PlanPicker() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const founding = useFoundingOffer();

  return (
    <>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <h1 className="text-[clamp(32px,4vw,48px)] font-normal leading-[1.1] tracking-[-0.045em]">
            Simple pricing. <span className="text-accent">Start free.</span>
          </h1>
          <p className="mt-4 max-w-140 text-muted text-[15px] leading-[1.8]">
            Plans differ only in volume, team size, and how long history is kept. Signing, retries, and replay are on every plan.
            Prices are in USD and adjust for your country at checkout.
          </p>
        </div>
        <div className="[&_fieldset]:my-0">
          <BillingIntervalPicker interval={interval} onChange={setInterval} />
        </div>
      </header>

      {founding && (
        <div className="mb-5 flex justify-center">
          <p role="status" className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-solid border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-accent-subtle px-5 py-2 text-center text-[13px] motion-safe:animate-row-in">
            <span className="font-medium text-accent">Founding customers: {founding.percent}% off {foundingTerm(founding)}</span>
            <span aria-hidden="true" className="text-muted">·</span>
            <span className="text-muted">Applied automatically at checkout</span>
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-solid border-border max-[56.25rem]:grid-cols-[minmax(0,1fr)]">
        {plans.map((plan, index) => {
          const isFeatured = plan.id === featured;
          const free = plan.monthly_cents === 0;
          return (
            <section key={plan.id} aria-labelledby={`plan-${plan.id}`}
              className={cn("relative flex min-w-0 flex-col p-8 max-[37.5rem]:p-6", index > 0 && "border-l border-solid border-border max-[56.25rem]:border-t max-[56.25rem]:border-l-0", isFeatured && "bg-surface")}>
              {isFeatured && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
              <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <h2 id={`plan-${plan.id}`} className="text-[21px] font-medium tracking-tight">{plan.name}</h2>
                {isFeatured && <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-accent text-[11px]">For your first customers</span>}
              </div>
              <p className="mt-3 text-[13px]/[1.65] text-muted">{planBlurbs[plan.id]}</p>
              <p key={interval} className="mt-7 text-[48px]/[1.05] tracking-[-.055em] motion-safe:animate-row-in">
                {founding && !free && <s className="mr-2.5 align-[0.35em] text-[18px] tracking-normal text-muted decoration-1">{planPrice(plan, interval)}</s>}
                {founding && !free ? discountedPrice(plan, interval, founding.percent) : planPrice(plan, interval)}
                <span className="ml-1.75 text-[13px] tracking-normal text-muted">/{free || interval === "monthly" ? "month" : "year"}</span>
              </p>
              <p className="mt-2.5 mb-6 text-[12px]/[1.7] text-muted min-[56.25rem]:min-h-10">
                {free ? "No card required. No expiry." : founding ? `Founding price ${foundingTerm(founding)}, then ${planPrice(plan, interval)} per ${interval === "annual" ? "year" : "month"}.`
                  : interval === "annual" ? "Billed yearly, two months free. Allowances reset monthly." : "Billed monthly. Cancel future renewals anytime."}
              </p>
              <Link href={free ? "/login" : billingStartHref({ plan: plan.id, interval })} className={buttonStyles({ variant: isFeatured ? "primary" : "secondary", className: press })}>
                {free ? "Start free" : "Choose " + plan.name}
              </Link>
              <dl className="mt-7 grid gap-3.5 border-t border-dashed border-border pt-6 text-[13px] [&>div]:flex [&>div]:justify-between [&>div]:gap-3.5 [&_dt]:text-muted [&_dd]:text-right [&_dd]:tabular-nums">
                {allowances.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value(plan)}</dd></div>)}
              </dl>
            </section>
          );
        })}
      </div>
    </>
  );
}
