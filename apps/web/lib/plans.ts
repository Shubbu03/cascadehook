import catalog from "../../server/internal/billing/plans.json";

export const plans = catalog;
export type Plan = (typeof plans)[number];
export type BillingInterval = "monthly" | "annual";

export function planPrice(plan: Plan, interval: BillingInterval) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format((interval === "annual" ? plan.annual_cents : plan.monthly_cents) / 100);
}

export function billingHref(organizationId: string) {
  return "/dashboard/organizations/" + encodeURIComponent(organizationId) + "/billing";
}

export type FoundingOffer = { active: boolean; percent: number; remaining: number; limit: number; months: number };

// Mirrors Dodo's percentage discount on the pre-tax price, rounded to the cent.
export function discountedPrice(plan: Plan, interval: BillingInterval, percent: number) {
  const cents = interval === "annual" ? plan.annual_cents : plan.monthly_cents;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.round(cents * (100 - percent)) / 10000);
}
