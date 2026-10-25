import { formatBytes, formatTime } from "@/lib/format";
import type { Usage } from "./types";

export function OrganizationUsageSummary({ usage }: { usage: Usage }) {
  return (
    <>
      <p className="section-description">
        {usage.period} · Resets {formatTime(usage.resets_at)}
      </p>
      <h2 className="settings-section-title">Organization</h2>
      <p className="section-description">
        Event and delivery quotas are shared across projects.
      </p>
      <div className="usage-grid">
        <Quota
          label="Events"
          value={usage.usage.events}
          limit={usage.limits.monthly_events}
        />
        <Quota
          label="Deliveries"
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

export function UsageActivity({ usage }: { usage: Usage }) {
  const values = [
    ["Accepted events this month", usage.usage.events],
    ["Deliveries created this month", usage.usage.deliveries],
    ["Attempts started", usage.usage.attempts_started],
    ["Successful attempts", usage.usage.successful_attempts],
    ["Unsuccessful attempts", usage.usage.unsuccessful_attempts],
    ["Replays", usage.usage.replays],
  ] as const;
  return (
    <dl className="detail-facts">
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
