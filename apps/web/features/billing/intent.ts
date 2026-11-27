import { plans, type BillingInterval } from "@/lib/plans";

export type BillingIntent = { plan: string; interval: BillingInterval };

const storageKey = "cascadehook:billing-intent";
const maxAgeMs = 60 * 60 * 1000;

export function readIntent(params: URLSearchParams | null): BillingIntent | null {
  const plan = params?.get("plan") ?? "";
  const interval = params?.get("interval") ?? "";
  if (interval !== "monthly" && interval !== "annual") return null;
  if (!plans.some((candidate) => candidate.id === plan && candidate.monthly_cents > 0)) return null;
  return { plan, interval };
}

export function intentQuery(intent: BillingIntent) {
  return new URLSearchParams({ plan: intent.plan, interval: intent.interval }).toString();
}

export function billingStartHref(intent: BillingIntent) {
  return "/dashboard/billing?" + intentQuery(intent);
}

// Sign-up and onboarding drop query strings, so the chosen plan waits here for up to an hour.
export function saveIntent(intent: BillingIntent) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ ...intent, savedAt: Date.now() }));
  } catch {}
}

export function takeIntent(): BillingIntent | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as BillingIntent & { savedAt?: number };
    if (!saved.savedAt || Date.now() - saved.savedAt > maxAgeMs) return null;
    return readIntent(new URLSearchParams({ plan: saved.plan, interval: saved.interval }));
  } catch {
    return null;
  }
}
