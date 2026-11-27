import { plans, planPrice, type Plan } from "@/lib/plans";

// From deliveries/lease.go and events/event.go; the same on every plan.
export const deliveryLimits = {
  attempts: 8,
  windowHours: 72,
  payloadKiB: 256,
};

// Default delivery policy from migrations/00026_expand_settings.sql and the jitter in delivery/outcome.go.
export const retryDelaysSeconds = [15, 60, 300, 1800, 7200, 21600, 64800] as const;
export const retryJitterPercent = 20;

export const count = (value: number) => value.toLocaleString("en-US");

function findPlan(id: string): Plan {
  const plan = plans.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Missing ${id} plan in plans.json`);
  return plan;
}

export const freePlan = findPlan("free");
export const paidPlans = plans.filter((plan) => plan.monthly_cents > 0);
export const cheapestPaidPlan = paidPlans.reduce((cheapest, plan) => (plan.monthly_cents < cheapest.monthly_cents ? plan : cheapest));

export const monthlyPrice = (plan: Plan) => planPrice(plan, "monthly");
export const monthlyDeliveries = (plan: Plan) => count(plan.limits.monthly_deliveries);

export function planSummary(plan: Plan) {
  const projects = plan.limits.projects === 1 ? "1 project" : `${plan.limits.projects} projects`;
  return `${monthlyDeliveries(plan)} deliveries a month, ${projects}, ${plan.retention_days}-day history`;
}

export const pricingPath = "/pricing";
