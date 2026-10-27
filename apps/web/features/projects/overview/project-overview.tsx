"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ArrowRightIcon,
  CheckIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { Select } from "@/components/select";
import { stateClass, stateLabel } from "@/features/activity/types";
import type { Endpoint } from "@/features/endpoints/types";
import { ConnectionError } from "@/features/workspace/connection-error";
import { useSessionUserId } from "@/features/workspace/session";
import { projectHref, useProject } from "../project-workspace";
import {
  setupActivityQuery,
  setupEndpointsQuery,
  setupKeyQuery,
} from "./queries";
import {
  chooseEndpoint,
  publicationBlock,
  setupChecks,
  type Activity,
  type ReadResult,
  type SetupCheck,
} from "./setup";
import { OverviewPublisher } from "./overview-publisher";

export function ProjectOverview() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const endpoints = useInfiniteQuery(
    setupEndpointsQuery(userId, project.id, getToken),
  );
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        endpoints.refetch(),
        client.invalidateQueries({
          queryKey: ["api-keys", userId, project.id, "overview-active"],
        }),
        client.invalidateQueries({
          queryKey: ["project-overview", userId, project.id],
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <section className="project-overview">
      <PageHeader
        title="Overview"
        actions={
          <RefreshButton
            pending={refreshing || endpoints.isFetching}
            refresh={refresh}
          />
        }
      />
      <QueryState query={endpoints}>
        {endpoints.data && (
          <OverviewSetup
            endpoints={endpoints.data.pages.flatMap((page) => page.data)}
          />
        )}
        <LoadMore query={endpoints} label="Load more endpoints" />
      </QueryState>
    </section>
  );
}

function observed<T>(query: {
  isSuccess: boolean;
  isError: boolean;
  data: T | undefined;
}): ReadResult<T> {
  return query.isSuccess && query.data !== undefined
    ? { status: "ready", data: query.data }
    : { status: query.isError ? "unavailable" : "checking" };
}

function OverviewSetup({ endpoints }: { endpoints: Endpoint[] }) {
  const { project, canManage, availabilityKnown, suspended } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const endpoint = chooseEndpoint(endpoints, selectedId);
  const key = useQuery(setupKeyQuery(userId, project.id, canManage, getToken));
  const activity = useQuery(
    setupActivityQuery(userId, project.id, endpoint?.id, getToken),
  );
  const keyRead = observed(key);
  const hasKey: ReadResult<boolean> =
    keyRead.status === "ready"
      ? { status: "ready", data: keyRead.data.data.length > 0 }
      : keyRead;
  const activityRead: ReadResult<Activity> = endpoint
    ? observed(activity)
    : { status: "ready", data: { latest: null, successful: null } };
  const checks = setupChecks(endpoint, canManage ? hasKey : null, activityRead);
  const completed = checks.filter((check) => check.state === "complete").length;
  const current = checks.find((check) => check.state !== "complete")?.id;
  const href = projectHref(project.id);
  const endpointHref = endpoint
    ? href + "/endpoints/" + encodeURIComponent(endpoint.id)
    : href + "/endpoints";
  const latest =
    activityRead.status === "ready" ? activityRead.data.latest : null;
  const successful =
    activityRead.status === "ready" ? activityRead.data.successful : null;
  const mayRegister = canManage && availabilityKnown && !suspended;
  const blockedReason = publicationBlock(
    endpoint,
    !availabilityKnown ? "checking" : suspended ? "paused" : "active",
  );

  function action(check: SetupCheck) {
    switch (check.id) {
      case "endpoint":
        return {
          href: endpoint
            ? endpointHref
            : mayRegister
              ? href + "/endpoints/new"
              : href + "/endpoints",
          label: endpoint
            ? "View"
            : mayRegister
              ? "Add endpoint"
              : "View endpoints",
        };
      case "secret":
        return {
          href: endpointHref + (endpoint ? "#signing-secret" : ""),
          label:
            canManage && endpoint && check.state === "todo"
              ? "Set secret"
              : "View",
        };
      case "receiver":
        return {
          href: endpointHref + (endpoint ? "#receiver-verification" : ""),
          label:
            canManage && endpoint && check.state === "todo"
              ? endpoint.verified_at
                ? "Enable"
                : "Verify"
              : "View",
        };
      case "key":
        return {
          href: href + "/api-keys",
          label: check.state === "todo" ? "Create key" : "View",
        };
      case "event":
        return latest
          ? { href: href + "/events/" + latest.event_id, label: "View event" }
          : canManage
            ? { href: "#publish-event", label: "Publish" }
            : { href: href + "/events", label: "View events" };
      case "delivery": {
        const delivery = successful ?? latest;
        return {
          href: delivery
            ? href + "/deliveries/" + delivery.id
            : href +
              "/deliveries" +
              (endpoint ? "?endpoint_id=" + endpoint.id : ""),
          label: "View delivery",
        };
      }
    }
  }
  const descriptions: Record<SetupCheck["id"], string> = {
    endpoint: "Choose the HTTPS receiver for your events.",
    secret: "Save the secret and use it to verify request signatures.",
    receiver: "Complete the ownership challenge, then enable the endpoint.",
    key: "Create a key when connecting your application. Dashboard publishing uses your account access.",
    event: "Publish a test event matching this endpoint’s subscriptions.",
    delivery: "Check that your receiver returned a successful response.",
  };

  return (
    <>
      {canManage && key.isError && (
        <ConnectionError
          error={key.error}
          retry={() => {
            void key.refetch();
          }}
          pending={key.isFetching}
        />
      )}
      {endpoint && activity.isError && (
        <ConnectionError
          error={activity.error}
          retry={() => {
            void activity.refetch();
          }}
          pending={activity.isFetching}
        />
      )}
      {endpoints.length > 1 && (
        <label className="filter-field overview-endpoint-picker">
          <span>Setup endpoint</span>
          <Select
            value={endpoint?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {endpoints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.url}
              </option>
            ))}
          </Select>
        </label>
      )}
      <div className="overview-grid">
        <section className="overview-setup" aria-labelledby="setup-heading">
          <div className="overview-section-heading">
            <h2 id="setup-heading">
              {completed === checks.length ? "Setup complete" : "Get started"}
            </h2>
            <span className="overview-progress" role="status">
              {completed} of {checks.length} complete
            </span>
          </div>
          {endpoint && (
            <p className="overview-destination mono">{endpoint.url}</p>
          )}
          {!canManage && (
            <p className="field-help">
              An owner or admin can change setup and manage API keys.
            </p>
          )}
          <ol className="overview-checklist">
            {checks.map((check, index) => {
              const link = action(check);
              return (
                <li
                  key={check.id}
                  data-state={check.state}
                  aria-current={current === check.id ? "step" : undefined}
                >
                  <span className="overview-step-number" aria-hidden="true">
                    {check.state === "complete" ? (
                      <CheckIcon size={15} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="overview-step-copy">
                    <h3>
                      {check.title}
                      {check.state === "complete" && (
                        <span className="sr-only"> — complete</span>
                      )}
                    </h3>
                    <p>
                      {check.state === "checking"
                        ? "Checking…"
                        : check.state === "unavailable"
                          ? "Could not check. Try refreshing."
                          : descriptions[check.id]}
                    </p>
                  </div>
                  <Link
                    href={link.href}
                    className="text-link overview-step-action"
                    aria-label={link.label + ": " + check.title}
                  >
                    {link.label}
                    <ArrowRightIcon size={14} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="overview-history-note field-help">
            Checks reflect current setup and retained delivery history.
          </p>
        </section>
        <div className="overview-integration">
          {canManage ? (
            <OverviewPublisher
              endpoint={endpoint}
              href={href}
              blockedReason={blockedReason}
            />
          ) : (
            <section className="overview-publish">
              <h2>Receiver integration</h2>
              <p className="section-description">
                Review signature validation and the ownership challenge.
              </p>
              <Link className="text-link" href={href + "/receiver-guide"}>
                Receiver guide →
              </Link>
            </section>
          )}
          <section
            className="overview-delivery"
            aria-labelledby="delivery-status-heading"
          >
            <div className="overview-section-heading">
              <h2 id="delivery-status-heading">Delivery status</h2>
              {latest && (
                <span className={"status " + stateClass(latest.state)}>
                  {stateLabel(latest.state)}
                </span>
              )}
            </div>
            {activityRead.status !== "ready" ? (
              <p className="field-help">
                {activityRead.status === "checking"
                  ? "Checking delivery history…"
                  : "Delivery history is unavailable."}
              </p>
            ) : latest ? (
              <>
                <p className="field-help">
                  {latest.state === "succeeded"
                    ? "Your receiver accepted the webhook."
                    : latest.state === "failed"
                      ? "Delivery failed. Review the attempts to troubleshoot or replay."
                      : latest.state === "canceled"
                        ? "Delivery was canceled. Check the endpoint before sending another event."
                        : "The event was accepted. Waiting for a successful delivery."}
                </p>
                <div className="form-actions">
                  <Link
                    href={href + "/deliveries/" + latest.id}
                    className="text-link"
                  >
                    View attempts →
                  </Link>
                  <Link
                    href={href + "/events/" + latest.event_id}
                    className="text-link workspace-muted"
                  >
                    View event
                  </Link>
                </div>
              </>
            ) : (
              <p className="field-help">
                {endpoint
                  ? "No events have been routed to this endpoint yet."
                  : "Add an endpoint to start receiving events."}
              </p>
            )}
            {successful && (
              <p className="overview-delivery-success">
                <CheckCircleIcon size={18} aria-hidden="true" />
                <Link href={href + "/deliveries/" + successful.id}>
                  Successful delivery confirmed →
                </Link>
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
