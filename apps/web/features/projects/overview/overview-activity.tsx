"use client";

import { Status } from "@/components/status";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { ArrowRightIcon, BroadcastIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/query-state";
import { stateTone, stateLabel } from "@/features/activity/types";
import type { Endpoint } from "@/features/endpoints/types";
import { useSessionUserId } from "@/features/workspace/session";
import { useFormatTime } from "@/lib/display-preferences";
import { projectHref, useProject } from "../project-workspace";
import { overviewDeliveriesQuery, overviewEventsQuery } from "./queries";
import { textLink } from "@/components/styles";

export function OverviewActivity({ endpoints }: { endpoints: Endpoint[]; }) {
  const formatTime = useFormatTime();
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const [view, setView] = useState<"deliveries" | "events">("deliveries");
  const deliveries = useQuery(
    overviewDeliveriesQuery(userId, project.id, getToken),
  );
  const events = useQuery(overviewEventsQuery(userId, project.id, getToken));
  const href = projectHref(project.id);

  return (
    <section
      className="min-w-0 rounded-[9px] bg-surface border border-solid border-border"
      aria-labelledby="recent-activity-heading"
    >
      <div className="flex items-center justify-between flex-wrap gap-y-2.5 gap-x-4 py-4 px-5 [&_h2]:text-[14px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[11px] @max-[27.5rem]/project-overview:px-4">
        <div>
          <h2 id="recent-activity-heading">Recent activity</h2>
          <p>Latest across this project · Updates every 15s</p>
        </div>
        <Link href={href + "/" + view} className={textLink}>
          View all <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
      <div
        className="flex border-b [border-bottom-style:solid] border-b-border gap-4.5 px-5 [&_button]:pt-1 [&_button]:pb-2.5 [&_button]:border-t-0 [&_button]:[border-right-style:none] [&_button]:border-b-2 [&_button]:[border-bottom-style:solid] [&_button]:border-b-transparent [&_button]:[border-left-style:none] [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:px-0 [&_button]:border-x-0 [&_button]:border-x-[currentColor] **:aria-pressed:border-b-accent **:aria-pressed:text-foreground pointer-coarse:[&_button]:min-h-11"
        role="group"
        aria-label="Activity view"
      >
        <button
          type="button"
          aria-pressed={view === "deliveries"}
          onClick={() => setView("deliveries")}
        >
          Deliveries
        </button>
        <button
          type="button"
          aria-pressed={view === "events"}
          onClick={() => setView("events")}
        >
          Events
        </button>
      </div>
      {view === "deliveries" ? (
        <QueryState query={deliveries} loading={<TableSkeleton columns={4} contained={false} label="Loading recent deliveries…" />}>
          {deliveries.data && (deliveries.data.data.length ? (
            <div className="overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[12px] [&_th]:text-muted [&_th]:bg-background [&_th]:text-[11px] [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:py-2.25 [&_th]:px-4 [&_td]:border-t [&_td]:border-t-border [&_td]:align-middle [&_td]:py-3 [&_td]:px-4 [&_time]:block [&_time]:min-w-26.25 [&_time]:text-muted [&_time]:text-[10px] [&_th:first-child]:w-full [&_tr:hover_td]:bg-surface-hover">
              <table>
                <caption className="sr-only">
                  Five most recent webhook deliveries
                </caption>
                <thead>
                  <tr>
                    <th>Delivery / destination</th>
                    <th>State</th>
                    <th>Attempts</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.data.data.map((delivery) => (
                    <tr key={delivery.id}>
                      <td>
                        <Link
                          href={href + "/deliveries/" + delivery.id}
                          className="font-mono block min-w-37.5 wrap-anywhere text-[11px] leading-[1.7] [&:hover]:text-accent"
                        >
                          {delivery.id}
                        </Link>
                        <span className="block w-55 max-w-full mt-0.75 text-muted text-[10px] truncate">
                          {endpoints.find(
                            (endpoint) => endpoint.id === delivery.endpoint_id,
                          )?.url ?? delivery.endpoint_id}
                        </span>
                      </td>
                      <td>
                        <Status tone={stateTone(delivery.state)}>
                          {stateLabel(delivery.state)}
                        </Status>
                      </td>
                      <td className="tabular-nums">{delivery.attempt_count}</td>
                      <td>
                        <time dateTime={delivery.created_at}>
                          {formatTime(delivery.created_at)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <ActivityEmpty view="deliveries" />)}
        </QueryState>
      ) : (
        <QueryState query={events} loading={<TableSkeleton columns={3} contained={false} label="Loading recent events…" />}>
          {events.data && (events.data.data.length ? (
            <div className="overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[12px] [&_th]:text-muted [&_th]:bg-background [&_th]:text-[11px] [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:py-2.25 [&_th]:px-4 [&_td]:border-t [&_td]:border-t-border [&_td]:align-middle [&_td]:py-3 [&_td]:px-4 [&_time]:block [&_time]:min-w-26.25 [&_time]:text-muted [&_time]:text-[10px] [&_th:first-child]:w-full [&_tr:hover_td]:bg-surface-hover">
              <table>
                <caption className="sr-only">
                  Five most recent published events
                </caption>
                <thead>
                  <tr>
                    <th>Event type / ID</th>
                    <th>Deliveries</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.data.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Link
                          href={href + "/events/" + event.id}
                          className="font-mono block min-w-37.5 wrap-anywhere text-[11px] leading-[1.7] [&:hover]:text-accent"
                        >
                          {event.type}
                        </Link>
                        <span className="font-mono block w-55 max-w-full mt-0.75 text-muted text-[10px] truncate">
                          {event.id}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={href + "/deliveries?event_id=" + encodeURIComponent(event.id)}
                          className={textLink}
                        >
                          {event.delivery_count}
                          <ArrowRightIcon size={12} aria-hidden="true" />
                        </Link>
                      </td>
                      <td>
                        <time dateTime={event.created_at}>
                          {formatTime(event.created_at)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <ActivityEmpty view="events" />)}
        </QueryState>
      )}
      <div className="border-t border-t-border py-3.25 px-5">
        <Link href={href + "/deliveries?state=failed"} className={textLink}>
          Review failed deliveries <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ActivityEmpty({ view }: { view: "deliveries" | "events"; }) {
  return (
    <div className="grid justify-items-center text-center gap-2 py-10 px-6 [&_>_svg]:text-muted [&_h3]:text-[14px] [&_h3]:font-medium [&_p]:max-w-90 [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.7]">
      <BroadcastIcon size={25} aria-hidden="true" />
      <h3>{view === "deliveries" ? "No deliveries yet" : "No events yet"}</h3>
      <p>
        {view === "deliveries"
          ? "Deliveries appear when an event matches an enabled endpoint’s subscriptions."
          : "Publish your first event to see activity here."}
      </p>
    </div>
  );
}
