"use client";

import { ArrowUpRightIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/button";
import { Modal } from "@/components/modal";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { dashboardMain } from "@/components/styles";
import { count } from "@/features/marketing/limits";
import { OrganizationUsageSummary, UsageActivity } from "@/features/settings/usage-summary";
import type { Usage } from "@/features/settings/types";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/classes";
import { formatTime } from "@/lib/format";
import { discountedPrice, plans, planPrice, type BillingInterval, type FoundingOffer, type Plan } from "@/lib/plans";
import { queryKeys } from "@/lib/query-keys";
import { supportEmail } from "@/lib/support";
import { BillingIntervalPicker } from "./billing-interval";
import { readIntent } from "./intent";

type BillingState = {
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
  activation_issue: boolean;
  amount: number | null;
  currency: string;
  discount_percent: number | null;
  discount_cycles: number | null;
};

type LocalPrice = { amount: number; currency: string };
type BillingResponse = {
  founding: FoundingOffer | null;
  can_manage: boolean;
  checkout_enabled: boolean;
  billing: BillingState;
  local_prices: Record<string, LocalPrice> | null;
};
type ChangePreview = { immediate: boolean; founding: boolean; total: number; tax: number; currency: string; effective_at: string };
type ChangeResult = { status: "redirect" | "pending_payment" | "applied" | "scheduled"; url: string; payment_id: string };
type Tone = "info" | "success" | "warning" | "danger";

const rank = (id: string) => plans.findIndex((plan) => plan.id === id);
const intervalRank = (interval: string) => (interval === "annual" ? 1 : 0);
const per = (interval: string) => (interval === "annual" ? "year" : "month");

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

function safeDodoUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !(url.hostname === "dodopayments.com" || url.hostname.endsWith(".dodopayments.com"))) {
    throw new Error("The payment link could not be verified. Contact support.");
  }
  return url.href;
}

const tones: Record<Tone, string> = {
  info: "border-border bg-surface text-muted",
  success: "border-success/40 bg-success-subtle text-foreground",
  warning: "border-warning/50 bg-warning-subtle text-foreground",
  danger: "border-danger/50 bg-danger-subtle text-foreground",
};

function Notice({ tone = "info", children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-solid px-5 py-4 text-[13px]/[1.7] [&_a]:underline [&_a]:underline-offset-[3px] motion-safe:animate-row-in", tones[tone])}>
      <div className="min-w-0 max-w-200">{children}</div>
      {action}
    </div>
  );
}

function StatusBadge({ state }: { state: BillingState }) {
  if (!state.has_subscription) return null;
  const label = state.cancel_at_period_end ? "Cancels at period end" : state.status.replaceAll("_", " ");
  const good = state.status === "active" && !state.cancel_at_period_end;
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium capitalize", good ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning")}>
      {label}
    </span>
  );
}

export function OrganizationBilling({ organizationId }: { organizationId: string }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const dialogHeading = useId();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const returned = search.get("checkout") === "returned";
  const cancelled = search.get("checkout") === "cancelled";
  const intent = readIntent(search);
  const returnedPayment = search.get("upgrade") === "returned" ? search.get("payment_id") : null;
  const [interval, setInterval] = useState<BillingInterval>(intent?.interval ?? "monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [change, setChange] = useState<{ plan: Plan; interval: BillingInterval; preview: ChangePreview | null } | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(returnedPayment);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const path = "/v1/organizations/" + encodeURIComponent(organizationId);
  const queryKey = ["billing", userId, organizationId];

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiRequest<BillingResponse>(path + "/billing", getToken, { signal }),
    refetchInterval: (current) => (returned && current.state.data?.billing.checkout_pending ? 5000 : false),
  });
  const usage = useQuery({
    queryKey: queryKeys.organizationUsage(userId, organizationId),
    queryFn: ({ signal }) => apiRequest<Usage>(path + "/usage", getToken, { signal }),
  });
  // Follows an upgrade payment until Dodo settles it, so a decline is shown instead of silence.
  const payment = useQuery({
    queryKey: ["billing-payment", userId, organizationId, paymentId],
    enabled: Boolean(paymentId),
    queryFn: async ({ signal }) => {
      const result = await apiRequest<{ status: string }>(path + "/billing/payments/" + encodeURIComponent(paymentId!), getToken, { signal });
      if (result.status === "succeeded") void client.invalidateQueries({ queryKey });
      return result;
    },
    refetchInterval: (current) => {
      const status = current.state.data?.status;
      return status === "succeeded" || status === "failed" || status === "cancelled" || current.state.dataUpdateCount > 40 ? false : 3000;
    },
  });

  async function run<T>(key: string, task: () => Promise<T>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(key);
    setError("");
    try {
      return await task();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Billing is unavailable. Please try again.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  const startCheckout = (plan: string, chosenInterval: BillingInterval) => run(plan, async () => {
    const result = await apiRequest<{ url: string }>(path + "/billing/checkout", getToken, { method: "POST", data: { plan, interval: chosenInterval } });
    window.location.assign(safeDodoUrl(result.url));
  });

  const openPortal = () => run("portal", async () => {
    const result = await apiRequest<{ url: string }>(path + "/billing/portal", getToken, { method: "POST" });
    window.location.assign(safeDodoUrl(result.url));
  });

  const reviewChange = (plan: Plan, chosenInterval: BillingInterval) => {
    setMessage(null);
    setChange({ plan, interval: chosenInterval, preview: null });
    void run("preview", async () => {
      const preview = await apiRequest<ChangePreview>(path + "/billing/change-plan/preview", getToken, {
        method: "POST", data: { plan: plan.id, interval: chosenInterval },
      });
      setChange({ plan, interval: chosenInterval, preview });
    }).then(() => setChange((current) => (current?.preview ? current : null)));
  };

  const resume = () => run("resume", async () => {
    await apiRequest(path + "/billing/resume", getToken, { method: "POST" });
    setMessage({ tone: "success", text: "Your subscription will renew as usual." });
    await client.invalidateQueries({ queryKey });
  });

  const applyChange = () => change && run("change", async () => {
    const result = await apiRequest<ChangeResult>(path + "/billing/change-plan", getToken, {
      method: "POST", data: { plan: change.plan.id, interval: change.interval },
    });
    if (result.status === "redirect" && result.url) {
      window.location.assign(safeDodoUrl(result.url));
      return;
    }
    setChange(null);
    if (result.status === "pending_payment" && result.payment_id) setPaymentId(result.payment_id);
    else if (result.status === "applied") setMessage({ tone: "success", text: `You're now on ${change.plan.name}.` });
    else setMessage({ tone: "info", text: `${change.plan.name} (${change.interval === "annual" ? "yearly" : "monthly"}) starts at your next renewal. Nothing is charged now.` });
    void client.invalidateQueries({ queryKey });
  });

  const data = query.data;
  const state = data?.billing;
  const currentPlan = plans.find((plan) => plan.id === state?.plan);
  const canChange = Boolean(state && state.has_subscription && state.status === "active" && !state.cancel_at_period_end);
  const manage = Boolean(data?.can_manage && data.checkout_enabled);
  // Dodo prices each plan in the customer's currency; USD list prices are the fallback.
  const local = (plan: Plan, chosenInterval: string) => data?.local_prices?.[`${plan.id}:${chosenInterval}`];
  const localCurrency = data?.local_prices ? Object.values(data.local_prices)[0]?.currency : undefined;
  const priceFor = (plan: Plan, chosenInterval: BillingInterval) => {
    if (plan.monthly_cents === 0 && localCurrency) return money(0, localCurrency);
    const price = local(plan, chosenInterval);
    return price ? money(price.amount, price.currency) : planPrice(plan, chosenInterval);
  };
  const renewal = (() => {
    if (!state || !currentPlan || !state.has_subscription) return null;
    const price = local(currentPlan, state.interval);
    if (!price) return state.amount != null ? money(state.amount, state.currency) : null;
    const discounted = state.discount_percent && state.discount_cycles !== 0 ? Math.round(price.amount * (100 - state.discount_percent) / 100) : price.amount;
    return money(discounted, price.currency);
  })();
  const paymentSucceeded = payment.data?.status === "succeeded";

  // Success notices clear themselves; the return parameters are dropped so a refresh doesn't repeat them.
  useEffect(() => {
    if (!paymentSucceeded && message?.tone !== "success") return;
    const timer = setTimeout(() => {
      setMessage((current) => (current?.tone === "success" ? null : current));
      if (paymentSucceeded) {
        setPaymentId(null);
        router.replace(pathname, { scroll: false });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [paymentSucceeded, message, pathname, router]);

  function planAction(plan: Plan) {
    if (!state || !data) return null;
    if (plan.monthly_cents === 0) {
      return state.has_subscription
        ? <p className="text-muted text-[12px]/[1.6]">{state.cancel_at_period_end && state.paid_through
          ? `This organization moves to Free on ${formatTime(state.paid_through)}.`
          : `To return to Free, cancel in Manage billing. You keep ${currentPlan?.name ?? "your plan"} until the paid period ends.`}</p>
        : <span className="inline-flex min-h-10 items-center gap-2 text-[13px] text-muted"><CheckIcon size={14} weight="bold" aria-hidden="true" /> Included</span>;
    }
    const isCurrent = state.has_subscription && state.plan === plan.id && state.interval === interval;
    if (isCurrent) return <Button type="button" variant="secondary" disabled>Current plan</Button>;
    if (state.scheduled_plan === plan.id && state.scheduled_interval === interval) return <Button type="button" variant="secondary" disabled>Starts at renewal</Button>;
    if (!manage) return null;
    if (state.can_checkout) {
      const resuming = state.checkout_pending && state.checkout_plan === plan.id && state.checkout_interval === interval;
      const blocked = state.checkout_pending && !resuming;
      return (
        <Button type="button" variant={plan.id === "starter" ? "primary" : "secondary"} disabled={busy !== null || blocked}
          onClick={() => void startCheckout(plan.id, interval)}>
          {busy === plan.id ? "Opening…" : resuming ? "Resume checkout" : `Choose ${plan.name}`}
        </Button>
      );
    }
    if (!canChange) return null;
    const upgrade = rank(plan.id) >= rank(state.plan) && intervalRank(interval) >= intervalRank(state.interval);
    return (
      <Button type="button" variant={upgrade ? "primary" : "secondary"} disabled={busy !== null} onClick={() => reviewChange(plan, interval)}>
        {upgrade ? `Upgrade to ${plan.name}` : `Switch at renewal`}
      </Button>
    );
  }

  const paymentStatus = payment.data?.status;
  return (
    <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
      <PageHeader title="Usage &amp; billing" actions={
        <Button type="button" size="small" variant="secondary" disabled={query.isFetching}
          onClick={() => { void Promise.all([query.refetch(), usage.refetch()]); }}>Refresh</Button>
      } />
      <QueryState query={query} loading={<PageSkeleton variant="usage" />}>
        {data && state && <div className="grid gap-8">
          <div className="grid gap-3 empty:hidden">
            {state.activation_issue && <Notice tone="warning">
              Your payment reached us, but the plan could not be activated automatically. We retry every few minutes. If it is not active within a few hours,
              email <a href={"mailto:" + supportEmail}>{supportEmail}</a> and don&apos;t pay again.
            </Notice>}
            {paymentId && (paymentStatus === "succeeded"
              ? <Notice tone="success">Payment received. Your new plan is active{state.plan ? ` (${currentPlan?.name})` : ""}.</Notice>
              : paymentStatus === "failed" || paymentStatus === "cancelled"
                ? <Notice tone="danger" action={<Button type="button" size="small" variant="secondary" onClick={() => setPaymentId(null)}>Dismiss</Button>}>
                  The upgrade payment didn&apos;t go through, so your plan hasn&apos;t changed and nothing was charged. Try again, or update your card in Manage billing.
                </Notice>
                : <Notice>
                  Confirming the upgrade payment… Your limits switch as soon as it clears. Some Indian cards take longer; you can leave this page.
                </Notice>)}
            {state.has_subscription && state.cancel_at_period_end && state.status === "active" && <Notice tone="warning"
              action={data.can_manage && data.checkout_enabled ? <Button type="button" size="small" disabled={busy !== null} onClick={() => void resume()}>{busy === "resume" ? "Keeping…" : "Keep my plan"}</Button> : undefined}>
              Your {currentPlan?.name} plan ends {state.paid_through ? `on ${formatTime(state.paid_through)}` : "at the end of this period"}. After that this organization moves to Free and its limits drop.
            </Notice>}
            {returned && state.checkout_pending && <Notice>Waiting for payment confirmation. This page refreshes automatically.</Notice>}
            {cancelled && state.checkout_pending && <Notice>
              Checkout was closed before payment, so nothing was charged. You can resume the same plan below; a different plan becomes available once the unused checkout expires, within a day.
            </Notice>}
            {intent && state.can_checkout && manage && !state.checkout_pending && <Notice
              action={<Button type="button" disabled={busy !== null} onClick={() => void startCheckout(intent.plan, intent.interval)}>{busy === intent.plan ? "Opening…" : "Continue to checkout"}</Button>}>
              You picked <strong className="font-medium text-foreground">{plans.find((plan) => plan.id === intent.plan)?.name}, {intent.interval === "annual" ? "yearly" : "monthly"}</strong> on the pricing page.
              You&apos;ll see the final price and taxes before paying.
            </Notice>}
            {!data.checkout_enabled && <Notice>Paid plans aren&apos;t available yet. Your current allowances keep working.</Notice>}
            {!data.can_manage && <Notice>Only organization owners can buy or change a plan.</Notice>}
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            {error && <Notice tone="danger">{error}</Notice>}
          </div>

          <section aria-labelledby="current-plan" className="rounded-2xl border border-solid border-border bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-6 p-7 max-[37.5rem]:p-5">
              <div className="min-w-0">
                <p className="text-muted text-[12px]">Current plan</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 id="current-plan" className="text-[28px] font-medium tracking-[-0.03em]">{currentPlan?.name ?? "Existing workspace"}</h2>
                  <StatusBadge state={state} />
                </div>
                <p className="mt-2 text-[14px] text-muted">
                  {state.plan === "legacy" ? "Your original allowances stay until you choose a paid plan."
                    : renewal ? <><span className="text-foreground">{renewal}</span> per {per(state.interval)} before tax</>
                      : currentPlan && currentPlan.monthly_cents === 0 ? "Free forever. No card on file." : null}
                  {state.paid_through && <> · {state.cancel_at_period_end ? "ends" : "renews"} {formatTime(state.paid_through)}</>}
                </p>
                {state.has_subscription && state.discount_percent && <p className="mt-1.5 text-[13px] text-accent">
                  Founding discount: {state.discount_percent}% off{state.discount_cycles != null ? ` for ${state.discount_cycles} more ${state.discount_cycles === 1 ? "renewal" : "renewals"}` : ""}.
                </p>}
                {state.scheduled_plan && state.scheduled_at && <p className="mt-1.5 text-[13px] text-accent">
                  Switching to {plans.find((plan) => plan.id === state.scheduled_plan)?.name}, {state.scheduled_interval === "annual" ? "yearly" : "monthly"}, on {formatTime(state.scheduled_at)}.
                </p>}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {data.can_manage && state.has_subscription && <Button type="button" variant="secondary" disabled={busy !== null || !data.checkout_enabled} onClick={() => void openPortal()}>
                  {busy === "portal" ? "Opening…" : "Manage billing"} <ArrowUpRightIcon size={14} aria-hidden="true" />
                </Button>}
                <Link href="/support" className="inline-flex min-h-11 items-center px-2 text-[13px] text-muted hover:text-foreground">Get help</Link>
              </div>
            </div>
          </section>

          <section aria-label="Usage this month">
            <QueryState query={usage} loading={<PageSkeleton variant="usage" />}>
              {usage.data && <>
                <OrganizationUsageSummary usage={usage.data} />
                <UsageActivity usage={usage.data} />
              </>}
            </QueryState>
          </section>

          <section aria-labelledby="plans-heading" className="border-t border-solid border-border pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="plans-heading" className="text-[19px] font-medium tracking-[-0.02em]">{state.has_subscription ? "Change plan" : "Plans"}</h2>
                <p className="mt-1 text-[13px] text-muted">
                  {canChange ? "Upgrades apply right away; you pay the difference for the rest of this period. Downgrades start at your next renewal."
                    : data.local_prices ? "Prices are before tax." : "Prices are before tax and adjust for your country at checkout."}
                </p>
              </div>
              <div className="[&_fieldset]:my-0"><BillingIntervalPicker interval={interval} onChange={setInterval} /></div>
            </div>
            <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-solid border-border max-[56.25rem]:grid-cols-1">
              {plans.map((plan, index) => {
                const current = state.has_subscription && state.plan === plan.id && state.interval === interval;
                const founding = data.founding && state.can_checkout && plan.monthly_cents > 0 ? data.founding : null;
                return (
                  <div key={plan.id} className={cn("relative flex min-w-0 flex-col gap-5 p-6", index > 0 && "border-l border-solid border-border max-[56.25rem]:border-t max-[56.25rem]:border-l-0", current && "bg-surface")}>
                    {current && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[16px] font-medium">{plan.name}</h3>
                        {current && <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] text-accent">Current</span>}
                      </div>
                      <p key={interval} className="mt-3 text-[30px] leading-none tracking-[-0.04em] motion-safe:animate-row-in">
                        {founding && <s className="mr-2 align-[0.3em] text-[14px] tracking-normal text-muted">{planPrice(plan, interval)}</s>}
                        {founding ? discountedPrice(plan, interval, founding.percent) : priceFor(plan, interval)}
                        <span className="ml-1 text-[12px] tracking-normal text-muted">/{plan.monthly_cents === 0 ? "month" : per(interval)}</span>
                      </p>
                      {founding && <p className="mt-2 text-[12px] text-accent">Founding price for your first {founding.months} months</p>}
                    </div>
                    <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px] text-muted">
                      <li>{count(plan.limits.monthly_deliveries)} deliveries a month</li>
                      <li>{plan.limits.projects} {plan.limits.projects === 1 ? "project" : "projects"} · {plan.limits.members} {plan.limits.members === 1 ? "member" : "members"}</li>
                      <li>{plan.retention_days} days of history</li>
                    </ul>
                    <div className="mt-auto [&>button]:w-full">{planAction(plan)}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[12px]/[1.7] text-muted">
              No automatic overage fees. Usage resets on the 1st of each month, also on yearly plans. <Link className="underline underline-offset-[3px]" href="/pricing">Compare all limits</Link> · <Link className="underline underline-offset-[3px]" href="/refunds">Refund policy</Link>
            </p>
          </section>
        </div>}
      </QueryState>


      {change && <Modal aria-labelledby={dialogHeading} onDismiss={() => setChange(null)} dismissDisabled={busy === "change"}
        className="m-auto w-[min(480px,calc(100vw-32px))] rounded-xl border border-solid border-border bg-surface p-6 text-foreground shadow-floating backdrop:bg-[#0008]">
        <h2 id={dialogHeading} className="text-[20px] font-medium tracking-[-0.02em]">
          {change.preview?.immediate === false ? "Switch" : "Upgrade"} to {change.plan.name}, {change.interval === "annual" ? "yearly" : "monthly"}
        </h2>
        {!change.preview ? <p className="mt-4 text-[14px] text-muted">Getting the exact price…</p> : change.preview.immediate ? <>
          <div className="mt-5 rounded-lg border border-solid border-border p-4">
            <p className="text-[12px] text-muted">Due now</p>
            <p className="mt-1 text-[26px] tracking-[-0.03em]">{money(change.preview.total, change.preview.currency)}</p>
            {change.preview.tax > 0 && <p className="text-[12px] text-muted">Includes {money(change.preview.tax, change.preview.currency)} tax</p>}
            {change.preview.founding && <p className="mt-1 text-[12px] text-accent">Your founding discount carries over to this plan.</p>}
          </div>
          <p className="mt-4 text-[13px]/[1.7] text-muted">
            This covers the rest of your current period at the new rate. You&apos;ll confirm the payment on a secure Dodo Payments page; your new limits apply as soon as it clears.
            After that it renews at {priceFor(change.plan, change.interval)} per {per(change.interval)} plus tax.
          </p>
        </> : <p className="mt-4 text-[13px]/[1.7] text-muted">
          Nothing is charged now. From {formatTime(change.preview.effective_at)} your plan renews at {change.preview.total > 0 ? `${money(change.preview.total, change.preview.currency)} per ${per(change.interval)}, tax included` : `${priceFor(change.plan, change.interval)} per ${per(change.interval)} plus tax`}. You keep your current limits until then.
        </p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="secondary" disabled={busy === "change"} onClick={() => setChange(null)}>Cancel</Button>
          <Button type="button" disabled={busy !== null || !change.preview} onClick={() => void applyChange()}>
            {busy === "change" ? "Working…" : change.preview?.immediate ? "Continue to payment" : "Schedule change"}
          </Button>
        </div>
      </Modal>}
    </main>
  );
}
