"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { projectPath, type EventDetail as EventRecord } from "./types";

export function EventDetail({ eventId }: { eventId: string }) {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const search = useSearchParams();
  const href = projectHref(project.id);
  const detail = useQuery({
    queryKey: ["event", userId, project.id, eventId],
    queryFn: ({ signal }) =>
      apiRequest<EventRecord>(
        projectPath(project.id, "events/" + encodeURIComponent(eventId)),
        getToken,
        { signal },
      ),
    gcTime: 0,
  });
  const payload = detail.data
    ? JSON.stringify(detail.data.payload, null, 2)
    : "";
  return (
    <section>
      <Link
        href={href + "/events" + (search.size ? "?" + search.toString() : "")}
        className="text-link workspace-muted"
      >
        ← Events
      </Link>
      <QueryState query={detail}>
        {detail.data && (
          <>
            <PageHeader
              title={detail.data.type}
              description={
                <div className="event-identifier">
                  <code>{eventId}</code>
                  <CopyButton
                    value={eventId}
                    label="Copy event ID"
                    successMessage="Event ID copied."
                    iconOnly
                  />
                </div>
              }
              actions={
                <Link
                  className="button button-small button-secondary"
                  href={
                    href + "/deliveries?event_id=" + encodeURIComponent(eventId)
                  }
                >
                  View deliveries
                </Link>
              }
            />
            <dl className="detail-facts">
              <div>
                <dt>Accepted</dt>
                <dd>{formatTime(detail.data.created_at)}</dd>
              </div>
              <div>
                <dt>Deliveries at acceptance</dt>
                <dd>{detail.data.delivery_count}</dd>
              </div>
            </dl>
            <div className="payload-heading">
              <h3>Accepted payload</h3>
              <CopyButton
                value={payload}
                label="Copy JSON"
                successMessage="Event JSON copied."
              />
            </div>
            <pre className="payload-view">
              <code>{payload}</code>
            </pre>
          </>
        )}
      </QueryState>
    </section>
  );
}
