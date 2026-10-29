"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/select";
import type { Endpoint } from "@/features/endpoints/types";
import { ConnectionError } from "@/features/workspace/connection-error";
import { useSessionUserId } from "@/features/workspace/session";
import { projectHref, useProject } from "../project-workspace";
import { setupActivityQuery, setupKeyQuery } from "./queries";
import {
  chooseEndpoint,
  publicationBlock,
  setupChecks,
  type Activity,
  type ReadResult,
  type SetupCheck,
} from "./setup";

function observed<T>(query: {
  isSuccess: boolean;
  isError: boolean;
  data: T | undefined;
}): ReadResult<T> {
  return query.isSuccess && query.data !== undefined
    ? { status: "ready", data: query.data }
    : { status: query.isError ? "unavailable" : "checking" };
}

const descriptions: Record<SetupCheck["id"], string> = {
  endpoint: "Choose the HTTPS receiver for your events.",
  secret: "Save a signing secret on your receiver to validate requests.",
  receiver: "Complete the ownership challenge, then enable delivery.",
  key: "Create a key to connect your application. You can test from the dashboard without one.",
  event: "Send a test event matching this endpoint’s subscriptions.",
  delivery: "Check that your receiver returned a successful response.",
};

export function OverviewSetup({
  endpoints,
  onPublish,
  onRegister,
  loadMore,
}: {
  endpoints: Endpoint[];
  onPublish: (endpoint: Endpoint) => void;
  onRegister: () => void;
  loadMore: React.ReactNode;
}) {
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
  const complete = completed === checks.length;
  const next = checks.find((check) => check.state !== "complete");
  const href = projectHref(project.id);
  const endpointHref = endpoint
    ? href + "/endpoints/" + encodeURIComponent(endpoint.id)
    : href + "/endpoints";
  const activityData = activityRead.status === "ready" ? activityRead.data : null;
  const mayRegister = canManage && availabilityKnown && !suspended;
  const blockedReason = publicationBlock(
    endpoint,
    !availabilityKnown ? "checking" : suspended ? "paused" : "active",
  );

  function action(check: SetupCheck) {
    switch (check.id) {
      case "endpoint":
        return {
          href: endpointHref,
          label: endpoint ? "View" : "View endpoints",
        };
      case "secret":
        return {
          href: endpointHref + (endpoint ? "#signing-secret" : ""),
          label: canManage && endpoint && check.state === "todo"
            ? "Set secret"
            : "View",
        };
      case "receiver":
        return {
          href: endpointHref +
            (endpoint && !endpoint.verified_at ? "#receiver-verification" : ""),
          label: canManage && endpoint && check.state === "todo"
            ? endpoint.verified_at ? "Enable" : "Verify"
            : "View",
        };
      case "key":
        return {
          href: href + "/api-keys",
          label: check.state === "todo" ? "Create key" : "View",
        };
      case "event":
        return activityData?.latest
          ? {
              href: href + "/events/" + activityData.latest.event_id,
              label: "View event",
            }
          : { href: href + "/events", label: "View events" };
      case "delivery": {
        const delivery = activityData?.successful ?? activityData?.latest;
        return {
          href: delivery
            ? href + "/deliveries/" + delivery.id
            : href + "/deliveries" +
              (endpoint ? "?endpoint_id=" + encodeURIComponent(endpoint.id) : ""),
          label: delivery ? "View delivery" : "View deliveries",
        };
      }
    }
  }

  function stepAction(check: SetupCheck, primary = false) {
    const className = primary
      ? "button button-small button-primary"
      : "text-link overview-step-action";
    if (check.id === "endpoint" && !endpoint && mayRegister) {
      return (
        <button type="button" className={className} onClick={onRegister}>
          Add endpoint <ArrowRightIcon size={14} aria-hidden="true" />
        </button>
      );
    }
    if (check.id === "event" && check.state === "todo" && canManage && endpoint) {
      return (
        <button
          type="button"
          className={className}
          disabled={Boolean(blockedReason)}
          title={blockedReason}
          onClick={() => onPublish(endpoint)}
        >
          Publish event <ArrowRightIcon size={14} aria-hidden="true" />
        </button>
      );
    }
    const link = action(check);
    return (
      <Link
        href={link.href}
        className={className}
        aria-label={link.label + ": " + check.title}
      >
        {link.label}
        <ArrowRightIcon size={14} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <details className="overview-setup" open={!complete} data-complete={complete}>
      <summary className="overview-setup-summary">
        <span className="overview-setup-label">
          {complete && (
            <CheckCircleIcon size={20} className="text-success" aria-hidden="true" />
          )}
          <span>{complete ? "Setup complete" : "Finish your setup"}</span>
          <span className="overview-progress" role="status">
            {completed} of {checks.length} complete
          </span>
        </span>
        <span className="overview-progress-track" aria-hidden="true">
          {checks.map((check) => (
            <span key={check.id} data-complete={check.state === "complete"} />
          ))}
        </span>
        <span className="overview-setup-toggle">
          Review steps <CaretDownIcon size={14} aria-hidden="true" />
        </span>
      </summary>
      <div className="overview-setup-body">
        {endpoints.length > 1 ? (
          <label className="filter-field overview-endpoint-picker">
            <span>Setup endpoint</span>
            <Select
              value={endpoint?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {endpoints.map((item) => (
                <option key={item.id} value={item.id}>{item.url}</option>
              ))}
            </Select>
          </label>
        ) : endpoint ? (
          <Link href={endpointHref} className="overview-destination mono">
            {endpoint.url}
          </Link>
        ) : null}
        {loadMore}
        {next && (
          <div className="overview-next-step">
            <div>
              <span className="eyebrow">Next step</span>
              <h2>{next.title}</h2>
              <p>
                {next.state === "checking"
                  ? "Checking your current setup…"
                  : next.state === "unavailable"
                    ? "Could not check this step. Try refreshing."
                    : descriptions[next.id]}
              </p>
            </div>
            {next.state === "todo" && stepAction(next, true)}
          </div>
        )}
        <ol className="overview-checklist">
          {checks.map((check, index) => (
            <li
              key={check.id}
              data-state={check.state}
              aria-current={next?.id === check.id ? "step" : undefined}
            >
              <span className="overview-step-number" aria-hidden="true">
                {check.state === "complete" ? <CheckIcon size={13} /> : index + 1}
              </span>
              <span className="overview-step-title">
                {check.title}
                <span className="sr-only"> — {check.state}</span>
              </span>
              {stepAction(check)}
            </li>
          ))}
        </ol>
        {!canManage && (
          <p className="field-help">
            An owner or admin can change setup and manage API keys.
          </p>
        )}
        <p className="overview-history-note field-help">
          Checks reflect this endpoint’s current setup and retained delivery history.
        </p>
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
      </div>
    </details>
  );
}
