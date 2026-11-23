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
import { buttonStyles } from "@/components/button";
import { Select } from "@/components/select";
import type { Endpoint } from "@/features/endpoints/types";
import { ConnectionError } from "@/features/workspace/connection-error";
import { useSessionUserId } from "@/features/workspace/session";
import { SetupSkeleton } from "@/features/workspace/skeletons";
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
      ? buttonStyles({ size: "small" })
      : "inline-flex min-h-7 items-center gap-1 border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-accent hover:underline hover:underline-offset-4 @max-[27.5rem]/project-overview:col-2 @max-[27.5rem]/project-overview:justify-self-start @max-[27.5rem]/project-overview:min-h-9 pointer-coarse:min-h-11";
    if (check.id === "endpoint" && !endpoint && mayRegister) {
      return (
        <button type="button" data-ui={primary ? "button" : undefined} className={className} onClick={onRegister}>
          Add endpoint <ArrowRightIcon size={14} aria-hidden="true" />
        </button>
      );
    }
    if (check.id === "event" && check.state === "todo" && canManage && endpoint) {
      return (
        <button
          type="button"
          data-ui={primary ? "button" : undefined} className={className}
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
        data-ui={primary ? "button" : undefined} className={className}
        aria-label={link.label + ": " + check.title}
      >
        {link.label}
        <ArrowRightIcon size={14} aria-hidden="true" />
      </Link>
    );
  }

  if ((canManage && key.isPending) || (endpoint && activity.isPending))
    return <SetupSkeleton />;

  return (
    <details data-ui="overview-setup" className="mb-6 rounded-[9px] bg-surface border border-solid border-border" open={!complete} data-complete={complete}>
      <summary className="flex items-center flex-wrap gap-y-3 gap-x-5 list-none py-4 px-5 [&::-webkit-details-marker]:hidden @max-[27.5rem]/project-overview:px-4">
        <span className="flex items-center flex-wrap gap-y-2 gap-x-3 text-[14px] font-medium">
          {complete && (
            <CheckCircleIcon size={20} className="text-success" aria-hidden="true" />
          )}
          <span>{complete ? "Setup complete" : "Finish your setup"}</span>
          <span className="text-muted text-[12px] font-normal tabular-nums" role="status">
            {completed} of {checks.length} complete
          </span>
        </span>
        <span className={"flex w-33 ml-auto gap-1 [&_>_span]:h-1 [&_>_span]:flex-1 [&_>_span]:rounded-xs [&_>_span]:bg-border *:data-[complete=\"true\"]:bg-success @max-[45rem]/project-overview:hidden"} aria-hidden="true">
          {checks.map((check) => (
            <span key={check.id} data-complete={check.state === "complete"} />
          ))}
        </span>
        <span className="flex items-center text-muted text-[12px] gap-2 [[data-ui~='overview-setup'][open]_&_svg]:transform-[rotate(180deg)] @max-[45rem]/project-overview:ml-auto">
          Review steps <CaretDownIcon size={14} aria-hidden="true" />
        </span>
      </summary>
      <div className="pt-0 pb-4 border-t border-t-border px-5 @max-[27.5rem]/project-overview:px-4">
        {endpoints.length > 1 ? (
          <label className="grid max-w-150 mt-3.5 gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5">
            <span>Setup endpoint</span>
            <Select className="in-data-[ui~='dashboard-main']:w-full in-data-[ui~='dashboard-main']:min-w-0 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
              value={endpoint?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {endpoints.map((item) => (
                <option key={item.id} value={item.id}>{item.url}</option>
              ))}
            </Select>
          </label>
        ) : endpoint ? (
          <Link href={endpointHref} className="font-mono block pt-3.5 text-muted text-[11px] wrap-anywhere [&:hover]:text-foreground">
            {endpoint.url}
          </Link>
        ) : null}
        {loadMore}
        {next && (
          <div className="flex items-center justify-between flex-wrap gap-y-3 gap-x-5 mt-3.5 mb-3 rounded-md bg-accent-subtle py-3.5 px-4 [&_>_div]:flex-[1_1_240px] [&_h2]:mt-0.75 [&_h2]:text-[14px] [&_h2]:font-medium [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.65]">
            <div>
              <span className="font-medium font-mono tracking-[0.02em] text-accent text-[10px]">Next step</span>
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
        <ol data-ui="overview-checklist" className="grid grid-cols-2 gap-y-0 gap-x-7 list-none p-0 my-2 mx-0 [&_li]:grid [&_li]:grid-cols-[22px_minmax(0,1fr)_auto] [&_li]:items-center [&_li]:min-w-0 [&_li]:border-b [&_li]:border-b-border [&_li]:gap-2 [&_li]:py-2.5 @max-[45rem]/project-overview:grid-cols-[1fr] @max-[27.5rem]/project-overview:[&_li]:grid-cols-[22px_minmax(0,1fr)]">
          {checks.map((check, index) => (
            <li
              key={check.id}
              data-state={check.state}
              aria-current={next?.id === check.id ? "step" : undefined}
            >
              <span className={"grid place-items-center rounded-full text-muted text-[10px] tabular-nums size-5.25 border border-solid border-border [[data-ui~='overview-checklist']_[aria-current=\"step\"]_&]:text-accent [[data-ui~='overview-checklist']_[aria-current=\"step\"]_&]:bg-accent-subtle [[data-ui~='overview-checklist']_[aria-current=\"step\"]_&]:border-accent [[data-ui~='overview-checklist']_[data-state=\"complete\"]_&]:text-success [[data-ui~='overview-checklist']_[data-state=\"complete\"]_&]:bg-success-subtle [[data-ui~='overview-checklist']_[data-state=\"complete\"]_&]:border-transparent"} aria-hidden="true">
                {check.state === "complete" ? <CheckIcon size={13} /> : index + 1}
              </span>
              <span className="text-[12px] wrap-anywhere">
                {check.title}
                <span className="sr-only"> — {check.state}</span>
              </span>
              {stepAction(check)}
            </li>
          ))}
        </ol>
        {!canManage && (
          <p className="text-[12px] text-muted leading-[1.7]">
            An owner or admin can change setup and manage API keys.
          </p>
        )}
        <p className="text-[11px] text-muted leading-[1.7] pt-1.5">
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
