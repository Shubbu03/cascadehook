"use client";

import { StatsSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { QueryState } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { projectHref, useProject } from "../project-workspace";
import { overviewUsageQuery } from "./queries";

export function OverviewMetrics() {
  const { project, canManage } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const usage = useQuery(
    overviewUsageQuery(userId, project.id, canManage, getToken),
  );
  const totals = usage.data?.usage;
  const metrics = totals
    ? [
        {
          label: "Events accepted",
          value: totals.events,
          note: "Published to this project",
        },
        {
          label: "Delivery cycles",
          value: totals.deliveries,
          note: "Includes replays",
        },
        {
          label: "Successful attempts",
          value: totals.successful_attempts,
          note: "Receiver accepted the request",
        },
        {
          label: "Unsuccessful attempts",
          value: totals.unsuccessful_attempts,
          note: "Includes retryable attempts",
        },
      ]
    : [];

  return (
    <section className="overview-month" aria-labelledby="overview-month-heading">
      <div className="overview-section-heading">
        <h2 id="overview-month-heading">
          This month
          {usage.data && (
            <span className="overview-period">{usage.data.period} · UTC</span>
          )}
        </h2>
        <Link href={projectHref(project.id) + "/usage"} className="text-link">
          Usage details <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
      <QueryState query={usage} loading={<StatsSkeleton />}>
        {usage.data && (
          <dl className="overview-metrics">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value.toLocaleString("en-US")}</dd>
                <dd className="overview-metric-note">{metric.note}</dd>
              </div>
            ))}
          </dl>
        )}
      </QueryState>
    </section>
  );
}
