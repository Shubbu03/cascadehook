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
