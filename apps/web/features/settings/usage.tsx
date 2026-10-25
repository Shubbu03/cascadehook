"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import { projectPath } from "@/features/activity/types";
import { useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { formatBytes, formatTime } from "@/lib/format";
import type { Usage } from "./types";

export function ProjectUsage() {
  const { canManage } = useProject();
  return canManage ? (
    <UsageContent />
  ) : (
    <p className="notice">
      Usage is available to organization owners and admins.
    </p>
  );
}

function UsageContent() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const projectUsage = useQuery({
    queryKey: ["usage", userId, "project", project.id],
    queryFn: ({ signal }) =>
      apiRequest<Usage>(projectPath(project.id, "usage"), getToken, { signal }),
  });
  const organization = useQuery({
    queryKey: ["usage", userId, "organization", project.organization_id],
    queryFn: ({ signal }) =>
      apiRequest<Usage>(
        "/v1/organizations/" +
          encodeURIComponent(project.organization_id) +
          "/usage",
        getToken,
        { signal },
      ),
  });
  return (
    <section>
      <PageHeader
        title="Usage"
        actions={
          <RefreshButton
            pending={projectUsage.isFetching || organization.isFetching}
            refresh={() =>
              Promise.all([projectUsage.refetch(), organization.refetch()])
            }
          />
        }
      />
      <QueryState query={organization}>
        {organization.data && (
          <>
            <p className="section-description">
              {organization.data.period} · Resets{" "}
              {formatTime(organization.data.resets_at)}
            </p>
            <h2 className="settings-section-title">Organization</h2>
            <p className="section-description">
              Event and delivery quotas are shared across projects.
            </p>
            <div className="usage-grid">
              <Quota
                label="Events"
                value={organization.data.usage.events}
                limit={organization.data.limits.monthly_events}
              />
              <Quota
                label="Deliveries"
                value={organization.data.usage.deliveries}
                limit={organization.data.limits.monthly_deliveries}
              />
              <Quota
                label="Projects"
                value={organization.data.projects}
                limit={organization.data.limits.projects}
              />
              <Quota
                label="Members"
                value={organization.data.members}
                limit={organization.data.limits.members}
              />
            </div>
          </>
        )}
      </QueryState>
      <QueryState query={projectUsage}>
        {projectUsage.data && (
          <>
            <h2 className="settings-section-title">This project</h2>
            <div className="usage-grid">
              <Quota
                label="Endpoints"
                value={projectUsage.data.endpoints}
                limit={projectUsage.data.limits.endpoints_per_project}
              />
              <Quota
                label="Active API keys"
                value={projectUsage.data.active_api_keys}
                limit={projectUsage.data.limits.active_api_keys_per_project}
              />
              <Quota
                label="Stored payloads"
                value={projectUsage.data.stored_payload_bytes}
                limit={projectUsage.data.limits.payload_bytes_per_project}
                bytes
              />
            </div>
            <dl className="detail-facts">
              <div>
                <dt>Accepted events this month</dt>
                <dd>
                  {projectUsage.data.usage.events.toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt>Deliveries created this month</dt>
                <dd>
                  {projectUsage.data.usage.deliveries.toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt>Attempts started</dt>
                <dd>
                  {projectUsage.data.usage.attempts_started.toLocaleString(
                    "en-US",
                  )}
                </dd>
              </div>
              <div>
                <dt>Successful attempts</dt>
                <dd>
                  {projectUsage.data.usage.successful_attempts.toLocaleString(
                    "en-US",
                  )}
                </dd>
              </div>
              <div>
                <dt>Unsuccessful attempts</dt>
                <dd>
                  {projectUsage.data.usage.unsuccessful_attempts.toLocaleString(
                    "en-US",
                  )}
                </dd>
              </div>
              <div>
                <dt>Replays</dt>
                <dd>
                  {projectUsage.data.usage.replays.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>
          </>
        )}
      </QueryState>
    </section>
  );
}

function Quota({
  label,
  value,
  limit,
  bytes = false,
}: {
  label: string;
  value: number;
  limit: number;
  bytes?: boolean;
}) {
  const format = bytes
    ? formatBytes
    : (item: number) => item.toLocaleString("en-US");
  return (
    <div className="usage-card">
      <h3>{label}</h3>
      <p>
        {format(value)} <span>/ {format(limit)}</span>
      </p>
      {limit > 0 && (
        <meter
          min={0}
          max={limit}
          value={Math.min(value, limit)}
          aria-label={label}
        />
      )}
    </div>
  );
}
