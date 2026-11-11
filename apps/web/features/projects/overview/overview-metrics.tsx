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
import { textLink } from "@/components/styles";

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
    <section data-ui="overview-month" className="mb-6" aria-labelledby="overview-month-heading">
      <div className="flex items-center justify-between flex-wrap gap-y-2.5 gap-x-4 [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [[data-ui~='overview-month']_>_&]:mb-2.5">
        <h2 id="overview-month-heading">
          This month
          {usage.data && (
            <span className="ml-2.5 text-muted text-[11px] font-normal">{usage.data.period} · UTC</span>
          )}
        </h2>
        <Link href={projectHref(project.id) + "/usage"} className={textLink}>
          Usage details <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
      <QueryState query={usage} loading={<StatsSkeleton />}>
        {usage.data && (
          <dl className="m-0 grid grid-cols-4 rounded-[9px] border border-border bg-surface @max-[45rem]/project-overview:grid-cols-2">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="min-w-0 border-l border-border px-5 py-4 first:border-l-0 @max-[45rem]/project-overview:nth-3:border-l-0 @max-[45rem]/project-overview:nth-[n+3]:border-t @max-[27.5rem]/project-overview:px-4 @max-[27.5rem]/project-overview:py-3.5"
              >
                <dt className="text-[12px] text-muted">{metric.label}</dt>
                <dd className="mx-0 mt-1.25 mb-0 text-[28px] font-medium leading-tight tracking-[-0.04em] tabular-nums wrap-anywhere @max-[27.5rem]/project-overview:text-[24px]">
                  {metric.value.toLocaleString("en-US")}
                </dd>
                <dd className="mx-0 mt-1.5 mb-0 text-[11px] font-normal leading-normal tracking-normal text-muted wrap-anywhere">
                  {metric.note}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </QueryState>
    </section>
  );
}
