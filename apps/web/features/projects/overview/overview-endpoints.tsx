"use client";

import { Button } from "@/components/button";

import {
  ArrowRightIcon,
  PlugsConnectedIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import { EndpointReadinessSkeleton } from "@/features/workspace/skeletons";
import { endpointState, type Endpoint } from "@/features/endpoints/types";
import { projectHref, useProject } from "../project-workspace";
import { textLink } from "@/components/styles";

export function OverviewEndpoints({
  endpoints,
  loading,
  unavailable,
  hasMore,
  onRegister,
}: {
  endpoints: Endpoint[];
  loading: boolean;
  unavailable: boolean;
  hasMore: boolean;
  onRegister: () => void;
}) {
  const { project, canManage, availabilityKnown, suspended } = useProject();
  const href = projectHref(project.id);
  const enabled = endpoints.filter((endpoint) => endpoint.enabled).length;
  const needsSetup = endpoints.filter(
    (endpoint) => !endpoint.has_signing_secret || !endpoint.verified_at,
  ).length;
  const disabled = endpoints.filter(
    (endpoint) =>
      !endpoint.enabled && endpoint.has_signing_secret && endpoint.verified_at,
  ).length;

  return (
    <aside
      className="min-w-0 rounded-[9px] bg-surface border border-solid border-border"
      aria-labelledby="overview-endpoints-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-y-2.5 gap-x-4 px-5 [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[11px] py-3 @max-[27.5rem]/project-overview:px-4">
        <h2 id="overview-endpoints-heading">Endpoint readiness</h2>
        {canManage && (
          <Button
            type="button"
            data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
            aria-label="Register endpoint"
            disabled={!availabilityKnown || suspended}
            onClick={onRegister}
          >
            <PlusIcon size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
      {loading ? (
        <EndpointReadinessSkeleton />
      ) : unavailable ? (
        <p className="pt-0 pb-5 text-muted text-[12px] leading-[1.7] px-5">
          Endpoint data is unavailable. Refresh to check readiness.
        </p>
      ) : endpoints.length ? (
        <>
          <dl className="grid grid-cols-3 pt-0 pb-4 gap-2.5 m-0 px-5 [&_dt]:text-muted [&_dt]:text-[11px] [&_dd]:mt-1 [&_dd]:mb-0 [&_dd]:text-[22px] [&_dd]:tabular-nums [&_dd]:mx-0">
            <div>
              <dt>Enabled</dt>
              <dd className="text-success">{enabled}</dd>
            </div>
            <div>
              <dt>Need setup</dt>
              <dd className={(needsSetup) ? "text-warning" : ""}>{needsSetup}</dd>
            </div>
            <div>
              <dt>Disabled</dt>
              <dd>{disabled}</dd>
            </div>
          </dl>
          {hasMore && (
            <p className="pt-0 pb-3 text-muted text-[11px] px-5">
              From the {endpoints.length} most recent endpoints.
            </p>
          )}
          <ul className="list-none p-0 m-0 [&_li]:border-t [&_li]:border-t-border [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_a]:py-3.25 [&_a]:px-5 [&_svg]:shrink-0 [&_svg]:text-muted [&_a:hover]:bg-surface-hover">
            {endpoints.slice(0, 4).map((endpoint) => (
              <li key={endpoint.id}>
                <Link href={href + "/endpoints/" + endpoint.id}>
                  <PlugsConnectedIcon size={16} aria-hidden="true" />
                  <span data-ui="overview-endpoint-copy" className="grid flex-1 min-w-0 text-[11px] gap-1 [&_>_span+span]:text-[10px]">
                    <span className="font-mono [[data-ui~='overview-endpoint-copy']_>_&]:truncate" title={endpoint.url}>
                      {endpoint.url.replace(/^https:\/\//, "")}
                    </span>
                    <span
                      className={(endpoint.enabled) ? "text-success" : "text-muted text-[13px]"}
                    >
                      {endpointState(endpoint)}
                    </span>
                  </span>
                  <ArrowRightIcon size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="pt-0 pb-5 text-muted text-[12px] leading-[1.7] px-5">
          Add a destination to start receiving signed webhooks.
        </p>
      )}
      <div className="grid justify-items-start border-t border-t-border gap-3 py-4 px-5">
        <Link href={href + "/endpoints"} className={textLink}>
          View all endpoints
          <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
        <DocsLink
          path="/docs/receivers"
          className="inline-flex items-center text-[13px] font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='project-overview']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]"
        >
          Receiver guide <ArrowRightIcon size={14} aria-hidden="true" />
        </DocsLink>
      </div>
    </aside>
  );
}
