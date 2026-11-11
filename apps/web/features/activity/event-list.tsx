"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { PlusIcon } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { eventTypePattern } from "@/features/endpoints/types";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";
import { projectPath, type EventSummary } from "./types";
import { PublishEventDialog } from "./publish-event-dialog";
import { dataTable, emptyState, errorText, filterBar, filterControl, filterField } from "@/components/styles";
import { queryKeys } from "@/lib/query-keys";

export function EventList() {
  const formatTime = useFormatTime();
  const { project, canManage, availabilityKnown, suspended } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const [validation, setValidation] = useState("");
  const [publishing, setPublishing] = useState(false);
  const type = search.get("event_type") ?? "";
  const valid = !type || eventTypePattern.test(type);
  const href = projectHref(project.id) + "/events";
  const list = useInfiniteQuery({
    queryKey: [...queryKeys.events(userId, project.id), type],
    enabled: valid,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<EventSummary>>(
        projectPath(project.id, "events"),
        getToken,
        {
          signal,
          params: {
            limit: 20,
            ...(type ? { event_type: type } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  function apply(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("event_type") ?? "",
    ).trim();
    if (value && !eventTypePattern.test(value)) {
      setValidation("Enter an exact event type, such as invoice.paid.");
      return;
    }
    setValidation("");
    router.push(
      href + (value ? "?event_type=" + encodeURIComponent(value) : ""),
    );
  }

  return (
    <section aria-labelledby="events-heading">
      <PageHeader
        title="Events"
        titleId="events-heading"
        actions={
          <>
            <RefreshButton pending={list.isFetching} refresh={list.refetch} />
            {canManage && (
              <Button
                type="button"
                data-ui="button" size="small" className="leading-[1.4]"
                disabled={!availabilityKnown || suspended}
                onClick={() => setPublishing(true)}
              >
                <PlusIcon size={16} aria-hidden="true" /> Publish event
              </Button>
            )}
          </>
        }
      />
      {canManage && publishing && (
        <PublishEventDialog
          key={userId + ":" + project.id}
          onClose={() => setPublishing(false)}
        />
      )}
      <form key={type} data-ui="activity-filters" className={filterBar} onSubmit={apply}>
        <label className={filterField}>
          <span>Event type</span>
          <Input className={filterControl}
            name="event_type"
            defaultValue={type}
            placeholder="e.g. invoice.paid"
            spellCheck={false}
          />
        </label>
        <Button type="submit" data-ui="button" variant="secondary" size="small" className="leading-[1.4]">
          Apply
        </Button>
        {type && (
          <Link
            href={href}
            className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 min-h-9.5 text-[13px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]"
            onClick={() => setValidation("")}
          >
            Clear filter
          </Link>
        )}
      </form>
      {(validation || !valid) && (
        <p className={errorText} role="alert">
          {validation || "Enter a valid event type."}
        </p>
      )}
      {valid && (
        <QueryState query={list} loading={<TableSkeleton columns={4} label="Loading events…" />}>
          {items.length ? (
            <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border">
              <table data-ui="data-table" className={dataTable}>
                <caption className="sr-only">Accepted events</caption>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Deliveries</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Link
                          className="font-mono text-accent underline decoration-transparent underline-offset-[3px] text-[11px] wrap-anywhere [&:hover]:decoration-current [[data-ui~='dashboard-main']_[data-ui~='data-table']_&]:text-[12px]"
                          href={
                            href +
                            "/" +
                            event.id +
                            (type
                              ? "?event_type=" + encodeURIComponent(type)
                              : "")
                          }
                        >
                          {event.id}
                        </Link>
                      </td>
                      <td>
                        <code>{event.type}</code>
                      </td>
                      <td>{event.delivery_count}</td>
                      <td>{formatTime(event.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div data-ui="empty-state" className={emptyState}>
              <h3>{type ? "No matching events" : "No events yet"}</h3>
              <p>Events published with your project API key appear here.</p>
            </div>
          )}
          <LoadMore query={list} />
        </QueryState>
      )}
    </section>
  );
}
