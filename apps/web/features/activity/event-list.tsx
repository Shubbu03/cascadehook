"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { eventTypePattern } from "@/features/endpoints/types";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { projectPath, type EventSummary } from "./types";

export function EventList() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const [validation, setValidation] = useState("");
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

  function apply(event: FormEvent<HTMLFormElement>) {
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
          <RefreshButton pending={list.isFetching} refresh={list.refetch} />
        }
      />
      <form key={type} className="activity-filters" onSubmit={apply}>
        <label className="filter-field">
          <span>Event type</span>
          <input
            name="event_type"
            defaultValue={type}
            placeholder="e.g. invoice.paid"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="button button-small button-secondary">
          Apply
        </button>
        {type && (
          <Link
            href={href}
            className="text-link"
            onClick={() => setValidation("")}
          >
            Clear filter
          </Link>
        )}
      </form>
      {(validation || !valid) && (
        <p className="form-error" role="alert">
          {validation || "Enter a valid event type."}
        </p>
      )}
      {valid && (
        <QueryState query={list}>
          {items.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
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
                          className="record-link mono"
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
            <div className="empty-state">
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
