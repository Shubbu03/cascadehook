"use client";

import { Select } from "@/components/select";
import { useAuth } from "@clerk/nextjs";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  PlugsConnectedIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { ConnectionError } from "@/features/workspace/connection-error";
import { ContentLoading } from "@/features/workspace/loading";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { EndpointRegistrationDialog } from "./endpoint-registration-dialog";
import {
  endpointKeys,
  endpointPath,
  endpointState,
  eventTypePattern,
  type Endpoint,
} from "./types";

export function EndpointList() {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const id = useId();
  const router = useRouter();
  const search = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const [enabled, setEnabled] = useState("");
  const [eventType, setEventType] = useState("");
  const [draftType, setDraftType] = useState("");
  const [filterError, setFilterError] = useState("");
  const href = projectHref(project.id) + "/endpoints";
  const list = useInfiniteQuery({
    queryKey: [
      ...endpointKeys.lists(userId, project.id),
      { enabled, eventType },
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Endpoint>>(endpointPath(project.id), getToken, {
        signal,
        params: {
          limit: 20,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(enabled ? { enabled } : {}),
          ...(eventType ? { event_type: eventType } : {}),
        },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = Boolean(enabled || eventType);
  const registrationRequested = search.get("register") === "1";

  function closeRegistration() {
    setRegistering(false);
    if (registrationRequested) {
      const params = new URLSearchParams(search.toString());
      params.delete("register");
      router.replace(href + (params.size ? "?" + params.toString() : ""), {
        scroll: false,
      });
    }
  }

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draftType.trim();
    if (value && !eventTypePattern.test(value)) {
      setFilterError("Enter an exact event type, such as invoice.paid.");
      return;
    }
    setFilterError("");
    setEventType(value);
  }

  return (
    <section>
      <PageHeader
        title="Endpoints"
        actions={
          canManage && (
            <button
              type="button"
              className="button button-primary"
              disabled={suspended || !availabilityKnown}
              onClick={() => setRegistering(true)}
            >
              <PlusIcon size={17} aria-hidden="true" />
              Register endpoint
            </button>
          )
        }
      />
      {canManage && (registering || registrationRequested) && (
        <EndpointRegistrationDialog
          onClose={closeRegistration}
          onRegistered={() => setRegistering(false)}
        />
      )}
      <div className="endpoint-toolbar">
        <label className="filter-field">
          <span>Status</span>
          <Select
            value={enabled}
            onChange={(event) => setEnabled(event.target.value)}
          >
            <option value="">All endpoints</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </Select>
        </label>
        <form className="event-filter" onSubmit={applyFilter}>
          <label className="filter-field" htmlFor={id}>
            <span>Event type</span>
            <input
              id={id}
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
              placeholder="e.g. invoice.paid"
              spellCheck={false}
              aria-invalid={Boolean(filterError)}
              aria-describedby={filterError ? id + "-error" : undefined}
            />
          </label>
          <button
            type="submit"
            className="button button-secondary button-small"
          >
            Apply
          </button>
        </form>
        <button
          type="button"
          className="button button-small button-quiet"
          onClick={() => {
            void list.refetch();
          }}
          disabled={list.isFetching}
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {list.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {filterError && (
        <p id={id + "-error"} className="form-error" role="alert">
          {filterError}
        </p>
      )}
      {filtered && (
        <div className="active-filters">
          <span className="workspace-muted">
            Showing{" "}
            {enabled === "true"
              ? "enabled endpoints"
              : enabled === "false"
                ? "disabled endpoints"
                : "all statuses"}
            {eventType ? " subscribed to " + eventType : ""}
          </span>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setEnabled("");
              setEventType("");
              setDraftType("");
              setFilterError("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {list.isPending ? (
        <ContentLoading />
      ) : list.isError && !list.data ? (
        <ConnectionError
          error={list.error}
          retry={() => {
            void list.refetch();
          }}
          pending={list.isFetching}
        />
      ) : (
        <>
          {list.isError && (
            <ConnectionError
              error={list.error}
              retry={() => {
                void list.refetch();
              }}
              pending={list.isFetching}
            />
          )}
          {items.length === 0 ? (
            <div className="empty-state">
              <PlugsConnectedIcon
                size={30}
                className="text-accent"
                aria-hidden="true"
              />
              <h3>{filtered ? "No matching endpoints" : "No endpoints yet"}</h3>
              <p>
                {filtered
                  ? "Adjust the status or event-type filter to find your endpoints."
                  : "Add a destination to receive your events."}
              </p>
              {!filtered && canManage && availabilityKnown && !suspended && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setRegistering(true)}
                >
                  Register an endpoint
                </button>
              )}
            </div>
          ) : (
            <div className="endpoint-list">
              <div className="endpoint-list-heading" aria-hidden="true">
                <span>Destination and subscriptions</span>
                <span>Delivery</span>
              </div>
              {items.map((endpoint) => (
                <Link
                  key={endpoint.id}
                  className="endpoint-row"
                  href={href + "/" + encodeURIComponent(endpoint.id)}
                >
                  <div className="endpoint-row-main">
                    <span className="endpoint-url">{endpoint.url}</span>
                    <span className="endpoint-subscription-summary">
                      {endpoint.event_types.slice(0, 3).join(" · ")}
                      {endpoint.event_types.length > 3
                        ? " · +" + (endpoint.event_types.length - 3) + " more"
                        : ""}
                    </span>
                  </div>
                  <span
                    className={
                      "status " +
                      (endpoint.enabled ? "status-success" : "status-neutral")
                    }
                  >
                    {endpointState(endpoint)}
                  </span>
                  <ArrowRightIcon size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
          {list.hasNextPage && (
            <button
              type="button"
              className="button button-quiet endpoint-load-more"
              disabled={list.isFetching}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more endpoints"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
