"use client";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { Select } from "@/components/select";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import {
  deliveryFilters,
  deliveryStates,
  projectPath,
  stateClass,
  stateLabel,
  type Delivery,
} from "./types";

export function DeliveryList() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const [validation, setValidation] = useState("");
  const [live, setLive] = useState(true);
  let invalid = "";
  let filters: ReturnType<typeof deliveryFilters> = {};
  try {
    filters = deliveryFilters(search);
  } catch (error) {
    invalid = (error as Error).message;
  }
  const href = projectHref(project.id) + "/deliveries";
  const list = useInfiniteQuery({
    queryKey: ["deliveries", userId, project.id, filters],
    enabled: !invalid,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Delivery>>(
        projectPath(project.id, "deliveries"),
        getToken,
        {
          signal,
          params: {
            limit: 20,
            ...filters,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: live ? 15_000 : false,
  });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = Object.keys(filters).length > 0;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["state", "endpoint_id", "event_id"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    try {
      deliveryFilters(params);
    } catch (error) {
      setValidation((error as Error).message);
      return;
    }
    setValidation("");
    router.push(href + (params.size ? "?" + params.toString() : ""));
  }

  return (
    <section aria-labelledby="deliveries-heading">
      <PageHeader
        title="Deliveries"
        titleId="deliveries-heading"
        actions={
          <>
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={live}
                onChange={(event) => setLive(event.target.checked)}
              />
              Auto-refresh
            </label>
            <RefreshButton pending={list.isFetching} refresh={list.refetch} />
          </>
        }
      />
      <form
        key={search.toString()}
        className="activity-filters"
        onSubmit={apply}
      >
        <label className="filter-field">
          <span>State</span>
          <Select name="state" defaultValue={search.get("state") ?? ""}>
            <option value="">All states</option>
            {deliveryStates.map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </Select>
        </label>
        <label className="filter-field">
          <span>Endpoint ID</span>
          <input
            name="endpoint_id"
            defaultValue={search.get("endpoint_id") ?? ""}
            placeholder="All endpoints"
            spellCheck={false}
          />
        </label>
        <label className="filter-field">
          <span>Event ID</span>
          <input
            name="event_id"
            defaultValue={search.get("event_id") ?? ""}
            placeholder="All events"
            spellCheck={false}
          />
        </label>
        <button className="button button-small button-secondary" type="submit">
          Apply
        </button>
        {(filtered || invalid) && (
          <Link
            href={href}
            className="text-link"
            onClick={() => setValidation("")}
          >
            Clear filters
          </Link>
        )}
      </form>
      {(validation || invalid) && (
        <p role="alert" className="form-error">
          {validation || invalid}
        </p>
      )}
      {!invalid && (
        <QueryState query={list} loading={<TableSkeleton columns={5} label="Loading deliveries…" />}>
          {items.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <caption className="sr-only">Webhook deliveries</caption>
                <thead>
                  <tr>
                    <th>Delivery / endpoint</th>
                    <th>State</th>
                    <th>Attempts</th>
                    <th>Next attempt</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((delivery) => (
                    <tr key={delivery.id}>
                      <td>
                        <Link
                          className="record-link mono"
                          href={
                            href +
                            "/" +
                            delivery.id +
                            (search.size ? "?" + search.toString() : "")
                          }
                        >
                          {delivery.id}
                        </Link>
                        <span className="table-secondary mono">
                          {delivery.endpoint_id}
                        </span>
                      </td>
                      <td>
                        <span
                          className={"status " + stateClass(delivery.state)}
                        >
                          {stateLabel(delivery.state)}
                        </span>
                      </td>
                      <td>
                        {delivery.attempt_count}
                        <span className="table-secondary">
                          Cycle {delivery.cycle}
                        </span>
                      </td>
                      <td>{formatTime(delivery.next_attempt_at)}</td>
                      <td>{formatTime(delivery.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>
                {filtered ? "No matching deliveries" : "No deliveries yet"}
              </h3>
              <p>
                {filtered
                  ? "Adjust the filters to see other deliveries."
                  : "Publish an event to an enabled endpoint to see its delivery here."}
              </p>
            </div>
          )}
          <LoadMore query={list} />
        </QueryState>
      )}
    </section>
  );
}
