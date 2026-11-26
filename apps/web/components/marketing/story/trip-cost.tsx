"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRef } from "react";
import { count, monthlyDeliveries, monthlyPrice, pricingPath } from "@/features/marketing/limits";
import { tripTotals } from "@/features/marketing/story";
import { plans, type Plan } from "@/lib/plans";
import { useCountUp, useInView, usePrefersReducedMotion } from "./hooks";

const tripsPerMonth = (plan: Plan) => Math.floor(plan.limits.monthly_deliveries / tripTotals.deliveries);

function PlanTrips({ plan, show, index }: { plan: Plan; show: boolean; index: number }) {
  const trips = useCountUp(show ? tripsPerMonth(plan) : 0, 1100 + index * 250);
  return (
    <li className="flex min-w-0 flex-col p-7 max-[53.125rem]:p-6 max-[37.5rem]:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-medium tracking-[-0.02em]">{plan.name}</span>
        <span className="text-muted text-[13px]">{monthlyPrice(plan)}<span className="text-[11px]"> / month</span></span>
      </div>
      <p className="mt-7 font-mono text-[40px] leading-none tracking-[-0.04em] tabular-nums max-[37.5rem]:text-[32px]">{count(trips)}</p>
      <p className="mt-2.5 text-muted text-[13px] leading-[1.6]">trips like this one, every month ({monthlyDeliveries(plan)} deliveries)</p>
    </li>
  );
}

export function TripCost() {
  const strip = useRef<HTMLDivElement>(null);
  const inView = useInView(strip, 0.35);
  const reduced = usePrefersReducedMotion();
  const show = inView || reduced;

  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="py-20 max-[53.125rem]:py-16 max-[37.5rem]:py-12" data-motion="reveal">
      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
        <div className="min-w-0">
          <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Pricing</p>
          <h2 id="pricing-heading" className="mt-4 max-w-160 text-[clamp(30px,3.4vw,42px)] font-normal leading-[1.16] tracking-[-0.045em] text-balance max-[37.5rem]:text-[29px]">
            That trip used {tripTotals.deliveries} deliveries. <span className="text-accent">The retries were free.</span>
          </h2>
          <p className="mt-4 max-w-140 text-muted text-[15px] leading-[1.85] max-[37.5rem]:text-[14px]">
            Every plan runs the same engine you just followed. Here&apos;s how many trips like that one each plan covers.
          </p>
        </div>
        <Link href={pricingPath} className="inline-flex min-h-11 items-center gap-2.5 text-[14px] text-accent hover:underline hover:underline-offset-[5px]">
          Estimate your own volume <ArrowRightIcon size={16} aria-hidden="true" />
        </Link>
      </div>
      <div ref={strip}>
        <ul className="mt-10 grid list-none grid-cols-3 rounded-2xl border border-solid border-border p-0 max-[53.125rem]:grid-cols-[minmax(0,1fr)] [&>li+li]:border-l [&>li+li]:border-solid [&>li+li]:border-border max-[53.125rem]:[&>li+li]:border-t max-[53.125rem]:[&>li+li]:border-l-0">
          {plans.map((plan, index) => <PlanTrips key={plan.id} plan={plan} show={show} index={index} />)}
        </ul>
      </div>
    </section>
  );
}
