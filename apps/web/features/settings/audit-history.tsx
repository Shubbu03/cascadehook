"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";

type AuditEntry = {
  id: string; action: string; actor_user_id: string | null; actor_api_key_id: string | null;
  actor_profile?: { name: string; email?: string }; target_type: string; target_id: string;
  changed_fields: string[]; created_at: string;
};

const targets: Record<string, string> = {
  organization: "Organization", project: "Project", delivery_policy: "Delivery policy", endpoint: "Endpoint",
  api_key: "API key", membership: "Membership", invitation: "Invitation",
};
const fields: Record<string, string> = {
  verification_version: "verification or subscriptions", signing_secret: "signing secret", rotated_to_id: "key rotation",
  deletion_requested_at: "deletion request", deleted_at: "deletion", revokes_at: "scheduled revocation",
  retry_delays_seconds: "retry delays", max_attempts: "attempt limit", timeout_seconds: "timeout",
};

export function AuditHistory({ organizationId, projectId }: { organizationId: string; projectId?: string }) {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const formatTime = useFormatTime();
  const history = useInfiniteQuery({
    queryKey: ["audit-history", userId, organizationId, projectId ?? "all"], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => apiRequest<Page<AuditEntry>>("/v1/organizations/" + encodeURIComponent(organizationId) + "/audit-log", getToken,
      { signal, params: { limit: 20, ...(projectId ? { project_id: projectId } : {}), ...(pageParam ? { cursor: pageParam } : {}) } }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const items = history.data?.pages.flatMap((page) => page.data) ?? [];
  return <section aria-labelledby="audit-history-title">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="audit-history-title" className="text-[17px] font-medium">Audit history</h2>
        <p className="mt-1.5 text-[13px]/7 text-muted">Configuration and access changes recorded from this update onward. History is retained for 90 days.</p></div>
      <RefreshButton pending={history.isFetching} refresh={history.refetch} />
    </div>
    <QueryState query={history}>
      {items.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-[13px]/7 text-muted">No changes recorded yet. Project, endpoint, API key, and team changes will appear here.</div>
        : <ol className="m-0 list-none divide-y divide-border rounded-xl border border-border bg-surface px-5 sm:px-6">
          {items.map((entry) => {
            const verb = entry.action.split(".").at(-1) ?? "updated";
            const actor = entry.actor_profile?.name || (entry.actor_user_id ? "Member · " + entry.actor_user_id.slice(-8)
              : entry.actor_api_key_id ? "API key · " + entry.actor_api_key_id.slice(-8) : "System or operator");
            return <li key={entry.id} className="flex flex-wrap justify-between gap-x-6 gap-y-2 py-5">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-[13px] font-medium">{targets[entry.target_type] ?? entry.target_type} {verb}</p>
                <p className="mt-1 text-[12px]/6 text-muted">{actor}</p>
                {entry.changed_fields.length > 0 && <p className="mt-1 text-[12px]/6 text-muted">Changed {entry.changed_fields.map((field) => fields[field] ?? field.replaceAll("_", " ")).join(", ")}</p>}
                <code className="mt-1 block break-all text-[10px] text-muted">{entry.target_id}</code>
              </div>
              <time dateTime={entry.created_at} className="text-[12px]/6 text-muted">{formatTime(entry.created_at)}</time>
            </li>;
          })}
        </ol>}
      <LoadMore query={history} label="Load older changes" />
    </QueryState>
  </section>;
}
