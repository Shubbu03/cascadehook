import type { Delivery } from "@/features/activity/types";
import type { Endpoint } from "@/features/endpoints/types";

export type Activity = { latest: Delivery | null; successful: Delivery | null };
export type ReadResult<T> =
  | { status: "checking" }
  | { status: "unavailable" }
  | { status: "ready"; data: T };
export type CheckState = "complete" | "todo" | "checking" | "unavailable";
export type SetupCheck = {
  id: "endpoint" | "secret" | "receiver" | "key" | "event" | "delivery";
  title: string;
  state: CheckState;
};

export function chooseEndpoint(endpoints: Endpoint[], selectedId: string) {
  const score = (endpoint: Endpoint) =>
    Number(endpoint.has_signing_secret) +
    Number(Boolean(endpoint.verified_at)) +
    Number(endpoint.enabled);
  return (
    endpoints.find((endpoint) => endpoint.id === selectedId) ??
    endpoints.reduce<Endpoint | undefined>(
      (best, endpoint) =>
        !best || score(endpoint) > score(best) ? endpoint : best,
      undefined,
    )
  );
}

export function setupChecks(
  endpoint: Endpoint | undefined,
  key: ReadResult<boolean> | null,
  activity: ReadResult<Activity>,
): SetupCheck[] {
  const checked = (value: boolean): CheckState => (value ? "complete" : "todo");
  const observed = <T>(
    result: ReadResult<T>,
    done: (data: T) => boolean,
  ): CheckState =>
    result.status === "ready" ? checked(done(result.data)) : result.status;
  return [
    {
      id: "endpoint",
      title: "Register an endpoint",
      state: checked(Boolean(endpoint)),
    },
    {
      id: "secret",
      title: "Set up its signing secret",
      state: checked(Boolean(endpoint?.has_signing_secret)),
    },
    {
      id: "receiver",
      title: "Verify and enable delivery",
      state: checked(
        Boolean(
          endpoint?.has_signing_secret &&
            endpoint.verified_at &&
            endpoint.enabled,
        ),
      ),
    },
    ...(key
      ? [
          {
            id: "key" as const,
            title: "Create a project API key",
            state: observed(key, Boolean),
          },
        ]
      : []),
    {
      id: "event",
      title: "Publish an event",
      state: observed(activity, (data) =>
        Boolean(data.latest || data.successful),
      ),
    },
    {
      id: "delivery",
      title: "Confirm successful delivery",
      state: observed(activity, (data) => Boolean(data.successful)),
    },
  ];
}

const shellQuote = (value: string) =>
  "'" + value.replaceAll("'", "'\\''") + "'";

export function publicationBlock(
  endpoint: Endpoint | undefined,
  key: ReadResult<boolean>,
  availability: "checking" | "paused" | "active",
) {
  if (availability === "paused")
    return "Publishing is unavailable while this project is paused.";
  if (availability === "checking")
    return "Project availability must be confirmed before publishing.";
  if (!endpoint) return "Register an endpoint to get started.";
  if (!endpoint.has_signing_secret)
    return "Set up the signing secret, then verify your receiver.";
  if (!endpoint.verified_at || !endpoint.enabled)
    return "Verify your receiver and enable the endpoint.";
  if (key.status === "checking")
    return "Checking for an active project API key…";
  if (key.status === "unavailable")
    return "Refresh API key status before publishing.";
  if (!key.data) return "Create a project API key to publish an event.";
}

export function setupCommand(
  origin: string,
  eventType: string,
  requestKey: string,
) {
  return [
    "curl -X POST " +
      shellQuote(origin.replace(/\/+$/, "") + "/v1/events") +
      " \\",
    "  -H 'Authorization: Bearer YOUR_PROJECT_API_KEY' \\",
    "  -H 'Content-Type: application/json' \\",
    "  -H " + shellQuote("Idempotency-Key: " + requestKey) + " \\",
    "  -d " +
      shellQuote(
        JSON.stringify(
          { type: eventType, data: { message: "Hello from Cascadehook" } },
          null,
          2,
        ),
      ),
  ].join("\n");
}
