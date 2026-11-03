"use client";

import { buttonStyles } from "@/components/button";

import { PageSkeleton } from "@/features/workspace/skeletons";
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

export function EventDetail({ eventId }: { eventId: string; }) {
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
        className="inline-flex items-center text-[13px] font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
      >
        ← Events
      </Link>
      <QueryState query={detail} loading={<PageSkeleton variant="event" />}>
        {detail.data && (
          <>
            <PageHeader
              title={detail.data.type}
              description={
                <div data-ui="event-identifier" className="inline-flex items-center max-w-full gap-2 [&_>_code]:min-w-0">
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
                  data-ui="button" className={buttonStyles({ variant: "secondary", size: "small", className: "leading-[1.4]" })}
                  href={
                    href + "/deliveries?event_id=" + encodeURIComponent(eventId)
                  }
                >
                  View deliveries
                </Link>
              }
            />
            <dl data-ui="detail-facts" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] rounded-[9px] bg-surface gap-6 p-5.5 my-6 border border-solid border-border [&_>_div]:min-w-0 [&_dt]:mb-2 [&_dt]:text-[12px] [&_dt]:text-muted [&_dd]:text-[13px] [&_dd]:leading-[1.7] [&_dd]:wrap-anywhere [&_dd]:m-0 [&_code]:text-[11px] max-[37.5rem]:p-4.5">
              <div>
                <dt>Accepted</dt>
                <dd>{formatTime(detail.data.created_at)}</dd>
              </div>
              <div>
                <dt>Deliveries at acceptance</dt>
                <dd>{detail.data.delivery_count}</dd>
              </div>
            </dl>
            <div className="flex items-center justify-between flex-wrap mt-7.5 gap-4 [&_h3]:text-[18px]">
              <h3>Accepted payload</h3>
              <CopyButton
                value={payload}
                label="Copy JSON"
                successMessage="Event JSON copied."
              />
            </div>
            <pre className="max-h-150 mt-4 rounded-[9px] bg-surface overflow-auto text-[12px] leading-[1.8] tab-2 p-5 border border-solid border-border">
              <code>{payload}</code>
            </pre>
          </>
        )}
      </QueryState>
    </section>
  );
}
