import { uuidPattern } from "@/lib/format";

export const deliveryStates = [
  "pending",
  "leased",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];
export type Delivery = {
  id: string;
  project_id: string;
  event_id: string;
  endpoint_id: string;
  state: DeliveryState;
  attempt_count: number;
  cycle: number;
  cycle_started_at: string;
  retry_deadline: string;
  next_attempt_at: string | null;
  terminal_reason: string | null;
  active_attempt_id: string | null;
  active_attempt_started_at: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Attempt = {
  id: string;
  project_id: string;
  delivery_id: string;
  cycle: number;
  attempt_number: number;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status_code: number | null;
  outcome: "succeeded" | "retryable" | "terminal" | "interrupted";
  error_code: string | null;
  response_truncated: boolean;
  response_read_error: boolean;
  delivery_state: DeliveryState;
  terminal_reason: string | null;
  retry_at: string | null;
};
export type ReplayReceipt = {
  id: string;
  delivery_id: string;
  from_cycle: number;
  cycle: number;
  created_at: string;
  retry_deadline: string;
};
export type EventSummary = {
  id: string;
  project_id: string;
  type: string;
  delivery_count: number;
  created_at: string;
};
export type EventDetail = EventSummary & { payload: unknown };

export function projectPath(projectId: string, resource: string) {
  return "/v1/projects/" + encodeURIComponent(projectId) + "/" + resource;
}

export function stateLabel(state: DeliveryState) {
  return state === "leased"
    ? "Delivering"
    : state[0].toUpperCase() + state.slice(1);
}

export function stateClass(state: string) {
  return state === "succeeded" || state === "active"
    ? "status-success"
    : state === "failed" || state === "terminal"
      ? "status-danger"
      : state === "pending" || state === "retryable" || state === "leased"
        ? "status-warning"
        : "status-neutral";
}

export function replayable(delivery: Pick<Delivery, "state">) {
  return delivery.state === "failed" || delivery.state === "succeeded";
}

export function deliveryFilters(params: Pick<URLSearchParams, "get">) {
  const state = params.get("state") ?? "";
  const event_id = params.get("event_id") ?? "";
  const endpoint_id = params.get("endpoint_id") ?? "";
  if (state && !deliveryStates.some((item) => item === state))
    throw new Error("Choose a valid delivery state.");
  if (event_id && !uuidPattern.test(event_id))
    throw new Error("Enter a valid event ID.");
  if (endpoint_id && !uuidPattern.test(endpoint_id))
    throw new Error("Enter a valid endpoint ID.");
  return {
    ...(state ? { state } : {}),
    ...(event_id ? { event_id } : {}),
    ...(endpoint_id ? { endpoint_id } : {}),
  };
}
