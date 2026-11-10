"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";
import { SettingsRow, SettingsSection } from "./settings-layout";

type RetentionReport = { history_days: number | null; notification_days: number | null; audit_days: number; reported_at: string | null };

export function RetentionSettings() {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const formatTime = useFormatTime();
  const policy = useQuery({ queryKey: ["retention-policy", userId],
    queryFn: ({ signal }) => apiRequest<RetentionReport>("/v1/settings/retention-policy", getToken, { signal }) });
  return <QueryState query={policy}>{policy.data && <>
    <SettingsSection title="Data retention" description="Retention is managed by the installation’s cleanup job and applies across projects.">
      <SettingsRow title="Events, payloads & delivery history" description="Cleanup waits for active deliveries and retained idempotency records to finish.">
        <span className="text-[13px]">{policy.data.history_days === null ? "Not reported yet" : `${policy.data.history_days} days`}</span>
      </SettingsRow>
      <SettingsRow title="Notification history"><span className="text-[13px]">{policy.data.notification_days === null ? "Not reported yet" : `${policy.data.notification_days} days`}</span></SettingsRow>
      <SettingsRow title="Audit history"><span className="text-[13px]">{policy.data.audit_days} days</span></SettingsRow>
    </SettingsSection>
    <p className="text-[12px]/7 text-muted">{policy.data.reported_at
      ? `Last reported by the cleanup job: ${formatTime(policy.data.reported_at)}. Removal runs in batches; these periods are eligibility thresholds.`
      : "The cleanup job has not reported its configuration yet. Run the updated janitor to report the active history and notification retention periods."}</p>
  </>}</QueryState>;
}
