"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { dashboardMain, errorText, textLink } from "@/components/styles";
import { OrganizationUsageSummary } from "@/features/settings/usage-summary";
import type { Usage } from "@/features/settings/types";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { plans, planPrice, type BillingInterval, type Plan } from "@/lib/plans";
import { queryKeys } from "@/lib/query-keys";
import { supportEmail } from "@/lib/support";
import { BillingIntervalPicker } from "./billing-interval";
import { planCard, planFootnote, planGrid, planNote, planPriceText } from "./plan-styles";

const billingNotice = "mb-5 rounded-lg border border-border p-4 text-[13px]/[1.7] text-muted [&_a]:underline";

type BillingResponse = {
  can_manage: boolean;
  checkout_enabled: boolean;
  billing: {
    plan: string;
    interval: string;
    status: string;
    paid_through: string | null;
    cancel_at_period_end: boolean;
    has_subscription: boolean;
    can_checkout: boolean;
    checkout_pending: boolean;
    checkout_plan: string;
    checkout_interval: string;
    retention_days: number;
    scheduled_plan: string;
    scheduled_interval: string;
    scheduled_at: string | null;
  };
};

export function OrganizationBilling({ organizationId }: { organizationId: string }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const returned = useSearchParams().get("checkout") === "returned";
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [change, setChange] = useState<{ plan: Plan; interval: BillingInterval } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const path = "/v1/organizations/" + encodeURIComponent(organizationId);
  const queryKey = ["billing", userId, organizationId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiRequest<BillingResponse>(path + "/billing", getToken, { signal }),
    refetchInterval: (query) => returned && query.state.data?.billing.checkout_pending ? 5000 : false,
  });
  const usage = useQuery({
    queryKey: queryKeys.organizationUsage(userId, organizationId),
    queryFn: ({ signal }) => apiRequest<Usage>(path + "/usage", getToken, { signal }),
  });

  async function open(action: "checkout" | "portal", plan?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(plan ?? "portal");
    setError("");
    try {
      const result = await apiRequest<{ url: string }>(path + "/billing/" + action, getToken, {
        method: "POST",
        ...(action === "checkout" ? { data: { plan, interval } } : {}),
      });
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !(url.hostname === "dodopayments.com" || url.hostname.endsWith(".dodopayments.com"))) {
        throw new Error("The payment link could not be verified. Contact support.");
      }
      window.location.assign(url.href);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Billing is unavailable. Please try again.");
    } finally {
      pending.current = false;
      setBusy(null);
      void client.invalidateQueries({ queryKey });
    }
  }

  async function scheduleChange() {
    if (pending.current || !change) return;
    pending.current = true;
    setBusy("change");
    setError("");
    try {
      await apiRequest(path + "/billing/change-plan", getToken, {
        method: "POST", data: { plan: change.plan.id, interval: change.interval },
      });
      setChange(null);
      setMessage("Your plan change is scheduled for the next renewal.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not confirm the change. Refresh before retrying.");
    } finally {
      pending.current = false;
      setBusy(null);
      void client.invalidateQueries({ queryKey });
    }
  }

  const state = query.data?.billing;
  const canChange = state?.status === "active" && !state.cancel_at_period_end;
  return (
    <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
      <PageHeader title="Billing" actions={
        <Button type="button" size="small" variant="secondary" disabled={query.isFetching}
          onClick={() => { void Promise.all([query.refetch(), usage.refetch()]); }}>Refresh</Button>
      } />
      <QueryState query={query} loading={<PageSkeleton variant="usage" />}>
        {query.data && state && <>
          <section className="mb-6 flex flex-wrap justify-between gap-6 border-y border-border py-6 [&_h2]:text-[26px] [&_h2]:tracking-[-.035em] [&_p]:mt-2 [&_p]:text-[13px] [&_p]:text-muted" aria-label="Current subscription">
            <div>
              <h2>{plans.find(plan => plan.id === state.plan)?.name ?? "Existing workspace"}</h2>
              <p>{state.plan === "legacy" ? "Your existing allowances are preserved until you choose a paid plan." :
                state.retention_days + " days of history · " + (state.interval === "annual" ? "Annual billing" : state.interval === "monthly" ? "Monthly billing" : "No subscription required")}</p>
              {state.paid_through && <p>{state.cancel_at_period_end ? "Paid access ends " : "Current paid period ends "}{formatTime(state.paid_through)}</p>}
              {state.has_subscription && <p>Subscription status: {state.status.replaceAll("_", " ")}</p>}
              {state.scheduled_plan && state.scheduled_at && <p>Scheduled: {plans.find(plan => plan.id === state.scheduled_plan)?.name}, {state.scheduled_interval} from {formatTime(state.scheduled_at)}.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {query.data.can_manage && state.has_subscription && <Button type="button" variant="secondary"
                disabled={busy !== null || !query.data.checkout_enabled} onClick={() => void open("portal")}>
                {busy === "portal" ? "Opening…" : "Manage subscription"}
              </Button>}
              <Link className={textLink} href="/support">Get help</Link>
            </div>
          </section>
          {!query.data.checkout_enabled && <p className={billingNotice}>Paid checkout is not available yet. You can continue using your current allowances. Contact <a href={"mailto:" + supportEmail}>{supportEmail}</a> for billing questions.</p>}
          {returned && state.checkout_pending && <p className={billingNotice} role="status">Waiting for payment confirmation. Refreshing automatically. Your plan changes after payment is confirmed.</p>}
          {state.checkout_pending && !returned && <p className={billingNotice}>An existing checkout is pending. Resume the same plan below. If the link expired or checkout could not be confirmed, contact support before starting another purchase.</p>}
          {!query.data.can_manage && <p className={billingNotice}>Only organization owners can purchase or manage a subscription.</p>}
          {error && <p className={errorText} role="alert">{error}</p>}
          {message && <p className={billingNotice} role="status">{message}</p>}
          {(state.can_checkout || canChange) && query.data.can_manage && <>
            <BillingIntervalPicker interval={interval} onChange={setInterval} />
            {canChange && <p className={planFootnote}>Plan and interval changes take effect at your next renewal. You keep your current allowances until then. A new selection replaces any scheduled change.</p>}
            <div className={planGrid}>{plans.map(plan => {
              const current = !state.can_checkout && state.plan === plan.id && state.interval === interval;
              const scheduled = state.scheduled_plan === plan.id && state.scheduled_interval === interval;
              return <section className={planCard + " border-border"} key={plan.id}>
                <h2>{plan.name}</h2>
                <p className={planPriceText}>{planPrice(plan, interval)}<span>/{plan.id === "free" || interval === "monthly" ? "month" : "year"}</span></p>
                <p className={planNote}>{plan.limits.monthly_deliveries.toLocaleString("en-US")} deliveries/month · {plan.retention_days} days of history</p>
                {plan.id !== "free" && <Button type="button"
                  disabled={busy !== null || !query.data?.checkout_enabled || current || scheduled ||
                    (state.checkout_pending && (state.checkout_plan !== plan.id || state.checkout_interval !== interval))}
                  onClick={() => state.can_checkout ? void open("checkout", plan.id) : setChange({ plan, interval })}>
                  {busy === plan.id ? "Opening…" : current ? "Current plan" : scheduled ? "Scheduled" : state.checkout_pending && state.checkout_plan === plan.id ? "Resume checkout" : "Choose " + plan.name}
                </Button>}
                {plan.id === "free" && state.has_subscription && <p className={planNote}>Cancel renewal in Manage subscription to return to Free after your paid period.</p>}
              </section>;
            })}</div>
          </>}
          {change && <section className={billingNotice} aria-label="Confirm plan change">
            <h2>Switch to {change.plan.name}</h2>
            <p>{planPrice(change.plan, change.interval)} per {change.interval === "annual" ? "year" : "month"}, plus applicable taxes, starting {state.paid_through ? formatTime(state.paid_through) : "at your next renewal"}. The subscription renews at this rate until cancelled. Usage already consumed is preserved.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" disabled={busy !== null} onClick={() => void scheduleChange()}>{busy === "change" ? "Scheduling…" : "Schedule change"}</Button>
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setChange(null)}>Keep current selection</Button>
            </div>
          </section>}
          {state.has_subscription && <p className={billingNotice}>Manage payment methods and cancellation through the billing portal. Cancellation stops future renewals; paid access continues through the paid period. For an immediate upgrade or help changing a scheduled plan, contact support.</p>}
          <p className={planFootnote}>USD pricing. Applicable taxes appear before payment. No automatic overage fees. Monthly usage resets on the first day of each calendar month, including annual plans. <Link href="/pricing">Compare all limits</Link> · <Link href="/refunds">Refund policy</Link></p>
        </>}
      </QueryState>
      <QueryState query={usage} loading={<PageSkeleton variant="usage" />}>
        {usage.data && <section className="mt-8"><OrganizationUsageSummary usage={usage.data} /></section>}
      </QueryState>
    </main>
  );
}
