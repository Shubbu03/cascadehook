"use client";

import {
  ArrowRightIcon,
  PlugsConnectedIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { EndpointReadinessSkeleton } from "@/features/workspace/skeletons";
import { endpointState, type Endpoint } from "@/features/endpoints/types";
import { projectHref, useProject } from "../project-workspace";

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
      className="overview-endpoints"
      aria-labelledby="overview-endpoints-heading"
    >
      <div className="overview-card-heading">
        <h2 id="overview-endpoints-heading">Endpoint readiness</h2>
        {canManage && (
          <button
            type="button"
            className="button button-small button-quiet"
            aria-label="Register endpoint"
            disabled={!availabilityKnown || suspended}
            onClick={onRegister}
          >
            <PlusIcon size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {loading ? (
        <EndpointReadinessSkeleton />
      ) : unavailable ? (
        <p className="overview-panel-message">
          Endpoint data is unavailable. Refresh to check readiness.
        </p>
      ) : endpoints.length ? (
        <>
          <dl className="overview-endpoint-counts">
            <div>
              <dt>Enabled</dt>
              <dd className="text-success">{enabled}</dd>
            </div>
            <div>
              <dt>Need setup</dt>
              <dd className={needsSetup ? "text-warning" : ""}>{needsSetup}</dd>
            </div>
            <div>
              <dt>Disabled</dt>
              <dd>{disabled}</dd>
            </div>
          </dl>
          {hasMore && (
            <p className="overview-loaded-note">
              From the {endpoints.length} most recent endpoints.
            </p>
          )}
          <ul className="overview-endpoint-list">
            {endpoints.slice(0, 4).map((endpoint) => (
              <li key={endpoint.id}>
                <Link href={href + "/endpoints/" + endpoint.id}>
                  <PlugsConnectedIcon size={16} aria-hidden="true" />
                  <span className="overview-endpoint-copy">
                    <span className="mono" title={endpoint.url}>
                      {endpoint.url.replace(/^https:\/\//, "")}
                    </span>
                    <span
                      className={endpoint.enabled ? "text-success" : "workspace-muted"}
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
        <p className="overview-panel-message">
          Add a destination to start receiving signed webhooks.
        </p>
        )}
      <div className="overview-endpoint-footer">
        <Link href={href + "/endpoints"} className="text-link">
          View all endpoints
          <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
        <Link
          href={href + "/receiver-guide"}
          className="text-link workspace-muted"
        >
          Receiver guide <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
