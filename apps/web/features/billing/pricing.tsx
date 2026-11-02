"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { plans, planPrice, type BillingInterval } from "@/lib/plans";

export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return (
    <>
      <div className="public-heading">
        <p className="landing-eyebrow">Room to build. Room to grow.</p>
        <h1>Start small.<br /><span>Pay as your product grows.</span></h1>
        <p>Signing, automatic retries, replay, and delivery history are included on every plan. No automatic overage charges.</p>
      </div>
      <fieldset className="billing-interval">
        <legend className="sr-only">Billing interval</legend>
        {(["monthly", "annual"] as const).map((value) => (
          <label key={value}>
            <input type="radio" name="interval" value={value} checked={interval === value} onChange={() => setInterval(value)} />
            <span>{value === "monthly" ? "Monthly" : "Yearly · 2 months free"}</span>
          </label>
        ))}
      </fieldset>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <section key={plan.id} className={"pricing-plan" + (plan.id === "starter" ? " pricing-plan-featured" : "")} aria-labelledby={"plan-" + plan.id}>
            <div className="pricing-plan-top"><h2 id={"plan-" + plan.id}>{plan.name}</h2>{plan.id === "starter" && <span>For your first customers</span>}</div>
            <p className="pricing-description">{plan.id === "free" ? "Try the full delivery flow on a small project." : plan.id === "starter" ? "For independent developers shipping webhooks." : "For growing products and small teams."}</p>
            <p className="pricing-price">{planPrice(plan, interval)}<span>/{plan.id === "free" || interval === "monthly" ? "month" : "year"}</span></p>
            <p className="pricing-price-note">{plan.id === "free" ? "No card required. No expiry." : interval === "annual" ? "Billed yearly. Your allowances reset monthly." : "Billed monthly. Cancel future renewals anytime."}</p>
            <Link href={plan.id === "free" ? "/login" : "/dashboard"} className={plan.id === "starter" ? "button button-primary" : "button button-secondary"}>{plan.id === "free" ? "Start free" : "Choose " + plan.name}</Link>
            <dl className="pricing-limits">
              <div><dt>Deliveries / month</dt><dd>{plan.limits.monthly_deliveries.toLocaleString("en-US")}</dd></div>
              <div><dt>Projects</dt><dd>{plan.limits.projects}</dd></div>
              <div><dt>Endpoints / project</dt><dd>{plan.limits.endpoints_per_project}</dd></div>
              <div><dt>Members, including you</dt><dd>{plan.limits.members}</dd></div>
              <div><dt>Delivery history</dt><dd>{plan.retention_days} days</dd></div>
              <div><dt>Stored payloads / project</dt><dd>{formatBytes(plan.limits.payload_bytes_per_project)}</dd></div>
            </dl>
          </section>
        ))}
      </div>
      <p className="pricing-footnote">Prices are in USD; applicable taxes are shown at checkout. Choose an organization in the dashboard, then open Billing to subscribe. Email support is included on every plan.</p>
      <section className="pricing-faq" aria-labelledby="pricing-questions">
        <h2 id="pricing-questions">A few straightforward answers.</h2>
        <details open><summary>What counts as a delivery?</summary><p>One event scheduled for one endpoint is one delivery, even if that receiver later fails. An event sent to three endpoints counts as three. Automatic retries are included; a manual replay counts as another delivery.</p></details>
        <details><summary>What happens at a limit?</summary><p>We warn at 80% and 100%. New publications or replays that exceed an allowance are rejected with an explicit error. Accepted deliveries and their retries continue, and you keep access to the dashboard. There are no automatic overage fees.</p></details>
        <details><summary>When do allowances reset?</summary><p>Monthly event and delivery allowances are shared across projects in an organization and reset on the first day of each calendar month at 00:00 UTC. This also applies to annual subscriptions. Plan changes do not reset usage.</p></details>
        <details><summary>Are there other limits?</summary><p>Published events have the same monthly allowance as deliveries, including events with no matching endpoint. Payloads are limited to 256 KiB. Free includes 5 active API keys per project; paid plans include 20. The default project API budget is 20 requests per second with a burst of 40, and 429 responses include Retry-After. Retention applies after active delivery work finishes; usage totals can remain after payload cleanup.</p></details>
        <details><summary>Can I cancel or request a refund?</summary><p>Cancel future renewals through Billing. Your paid access remains until the end of the paid period. You can request a refund within seven days of your first purchase. See our <Link href="/refunds">refund and cancellation policy</Link>.</p></details>
        <details><summary>What happens to existing workspaces?</summary><p>Workspaces created before these plans keep their existing allowances until they choose a paid plan. Their dashboard shows the actual limits that apply.</p></details>
      </section>
    </>
  );
}
