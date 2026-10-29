"use client";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { ArrowRightIcon, BroadcastIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/query-state";
import { stateClass, stateLabel } from "@/features/activity/types";
import type { Endpoint } from "@/features/endpoints/types";
import { useSessionUserId } from "@/features/workspace/session";
import { formatTime } from "@/lib/format";
import { projectHref, useProject } from "../project-workspace";
import { overviewDeliveriesQuery, overviewEventsQuery } from "./queries";

export function OverviewActivity({ endpoints }: { endpoints: Endpoint[] }) {
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
      className="overview-activity"
      aria-labelledby="recent-activity-heading"
    >
      <div className="overview-card-heading">
        <div>
          <h2 id="recent-activity-heading">Recent activity</h2>
          <p>Latest across this project · Updates every 15s</p>
        </div>
        <Link href={href + "/" + view} className="text-link">
          View all <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
      <div
        className="overview-activity-switch"
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
            <div className="overview-activity-table">
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
                          className="overview-activity-id mono"
                        >
                          {delivery.id}
                        </Link>
                        <span className="overview-activity-detail">
                          {endpoints.find(
                            (endpoint) => endpoint.id === delivery.endpoint_id,
                          )?.url ?? delivery.endpoint_id}
                        </span>
                      </td>
                      <td>
                        <span className={"status " + stateClass(delivery.state)}>
                          {stateLabel(delivery.state)}
                        </span>
                      </td>
                      <td className="overview-attempt-count">{delivery.attempt_count}</td>
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
            <div className="overview-activity-table">
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
                          className="overview-activity-id mono"
                        >
                          {event.type}
                        </Link>
                        <span className="overview-activity-detail mono">
                          {event.id}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={href + "/deliveries?event_id=" + encodeURIComponent(event.id)}
                          className="text-link"
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
      <div className="overview-activity-footer">
        <Link href={href + "/deliveries?state=failed"} className="text-link">
          Review failed deliveries <ArrowRightIcon size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ActivityEmpty({ view }: { view: "deliveries" | "events" }) {
  return (
    <div className="overview-activity-empty">
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
