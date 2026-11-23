// Default organization quotas from apps/server migrations/00017_add_usage_and_quotas.sql,
// retention from internal/retention, and delivery limits from deliveries/lease.go and events/event.go.
export const freeLimits = [
  { label: "Events per month", value: "100,000" },
  { label: "Deliveries per month", value: "1,000,000" },
  { label: "Endpoints per project", value: "100" },
  { label: "Projects", value: "10" },
  { label: "Team members", value: "20" },
  { label: "Delivery history", value: "30 days" },
] as const;

export const deliveryLimits = {
  attempts: 8,
  windowHours: 72,
  payloadKiB: 256,
};

export const freeLimitsNote = "Free during early access. Need higher limits? Email us.";
