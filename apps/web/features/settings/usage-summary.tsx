"use client";

import { useFormatTime } from "@/lib/display-preferences";
import { formatBytes } from "@/lib/format";
import type { Usage } from "./types";

export function OrganizationUsageSummary({ usage }: { usage: Usage; }) {
  const formatTime = useFormatTime();
  return (
    <>
      <p className="mt-3 mb-4.5 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px]">
        {usage.period} · Resets {formatTime(usage.resets_at)}
      </p>
      <h2 className="mt-9 text-[19px] in-data-[ui~='dashboard-main']:mt-7 in-data-[ui~='dashboard-main']:text-[17px]">Organization</h2>
      <p className="mt-3 mb-4.5 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px]">
        Quotas are shared across projects. Replays count as new delivery cycles;
        automatic retries don’t.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-4 my-6 in-data-[ui~='dashboard-main']:grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] in-data-[ui~='dashboard-main']:gap-3.5 in-data-[ui~='dashboard-main']:my-5">
        <Quota
          label="Events"
          value={usage.usage.events}
          limit={usage.limits.monthly_events}
        />
        <Quota
          label="Delivery cycles"
          value={usage.usage.deliveries}
          limit={usage.limits.monthly_deliveries}
        />
        <Quota
          label="Projects"
          value={usage.projects}
          limit={usage.limits.projects}
        />
        <Quota
          label="Members"
          value={usage.members}
          limit={usage.limits.members}
        />
      </div>
    </>
  );
}

export function UsageActivity({ usage }: { usage: Usage; }) {
  const values = [
    ["Accepted events this month", usage.usage.events],
    ["Delivery cycles this month", usage.usage.deliveries],
    ["Attempts started", usage.usage.attempts_started],
    ["Successful attempts", usage.usage.successful_attempts],
    ["Unsuccessful attempts", usage.usage.unsuccessful_attempts],
    ["Replays", usage.usage.replays],
  ] as const;
  return (
    <dl data-ui="detail-facts" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] rounded-[9px] bg-surface gap-6 p-5.5 my-6 border border-solid border-border [&_>_div]:min-w-0 [&_dt]:mb-2 [&_dt]:text-[12px] [&_dt]:text-muted [&_dd]:text-[13px] [&_dd]:leading-[1.7] [&_dd]:wrap-anywhere [&_dd]:m-0 [&_code]:text-[11px] max-[37.5rem]:p-4.5">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value.toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Quota({
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
    <div className="rounded-[9px] bg-surface p-5 border border-solid border-border [&_h3]:text-muted [&_h3]:text-[12px] [&_h3]:font-normal [&_p]:text-[22px] [&_p]:tabular-nums [&_p]:my-3.75 [&_meter]:w-full [&_meter]:h-2 [&_meter]:accent-accent [&_meter]:block [&_meter]:rounded-sm [&_meter]:bg-surface-hover [&_meter]:overflow-hidden [&_meter]:border-0 [&_meter]:border-none [&_meter]:border-current [&_p_>_span]:text-muted [&_p_>_span]:text-[13px] in-data-[ui~='dashboard-main']:bg-surface in-data-[ui~='dashboard-main']:p-4.5 [[data-ui~='dashboard-main']_&_p]:text-[24px] [&_meter::-webkit-meter-bar]:rounded-sm [&_meter::-webkit-meter-bar]:bg-surface-hover [&_meter::-webkit-meter-bar]:border-0 [&_meter::-webkit-meter-bar]:border-none [&_meter::-webkit-meter-bar]:border-current [&_meter::-webkit-meter-optimum-value]:rounded-sm [&_meter::-webkit-meter-optimum-value]:bg-accent [&_meter::-moz-meter-bar]:bg-accent">
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
