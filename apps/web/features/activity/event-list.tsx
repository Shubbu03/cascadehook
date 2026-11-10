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
    queryKey: ["events", userId, project.id, type],
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
      <form key={type} data-ui="activity-filters" className="flex [align-items:end] flex-wrap mt-4.5 mb-6 gap-3 in-data-[ui~='dashboard-main']:mt-0 in-data-[ui~='dashboard-main']:mb-5 in-data-[ui~='dashboard-main']:pt-0 in-data-[ui~='dashboard-main']:pb-5 in-data-[ui~='dashboard-main']:border-b in-data-[ui~='dashboard-main']:[border-bottom-style:solid] in-data-[ui~='dashboard-main']:border-b-border in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:mx-0 in-data-[ui~='dashboard-main']:px-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:gap-2.5" onSubmit={apply}>
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>Event type</span>
          <Input className="[[data-ui~='dashboard-main']_&]:w-55 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:px-2.5 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full min-w-0 w-52.5 py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
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
            className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent min-h-9.5 text-[13px] in-data-[ui~='data-table']:text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
            onClick={() => setValidation("")}
          >
            Clear filter
          </Link>
        )}
      </form>
      {(validation || !valid) && (
        <p className="text-danger text-[13px] my-3" role="alert">
          {validation || "Enter a valid event type."}
        </p>
      )}
      {valid && (
        <QueryState query={list} loading={<TableSkeleton columns={4} label="Loading events…" />}>
          {items.length ? (
            <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border">
              <table data-ui="data-table" className="w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-top [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:[border-top-style:solid] [&_tr+tr_td]:border-t-border [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3">
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
            <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
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
