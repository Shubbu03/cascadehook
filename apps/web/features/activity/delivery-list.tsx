"use client";

import { Status } from "@/components/status";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { Select } from "@/components/select";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";
import {
  deliveryFilters,
  deliveryStates,
  projectPath,
  stateTone,
  stateLabel,
  type Delivery,
} from "./types";
import { dataTable, emptyState, errorText, filterBar, filterControl, filterField } from "@/components/styles";
import { queryKeys } from "@/lib/query-keys";

export function DeliveryList() {
  const formatTime = useFormatTime();
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
    queryKey: [...queryKeys.deliveries(userId, project.id), filters],
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

  function apply(event: SubmitEvent<HTMLFormElement>) {
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
            <label className="flex items-center text-muted text-[12px] gap-1.75 in-data-[ui~='dashboard-main']:text-[12px] in-data-[ui~='dashboard-main']:gap-1.75">
              <input className="in-data-[ui~='dashboard-main']:accent-accent accent-accent size-4"
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
        data-ui="activity-filters" className={filterBar}
        onSubmit={apply}
      >
        <label className={filterField}>
          <span>State</span>
          <Select className="in-data-[ui~='dashboard-main']:w-auto in-data-[ui~='dashboard-main']:min-w-37.5 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" name="state" defaultValue={search.get("state") ?? ""}>
            <option value="">All states</option>
            {deliveryStates.map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </Select>
        </label>
        <label className={filterField}>
          <span>Endpoint ID</span>
          <Input className={filterControl}
            name="endpoint_id"
            defaultValue={search.get("endpoint_id") ?? ""}
            placeholder="All endpoints"
            spellCheck={false}
          />
        </label>
        <label className={filterField}>
          <span>Event ID</span>
          <Input className={filterControl}
            name="event_id"
            defaultValue={search.get("event_id") ?? ""}
            placeholder="All events"
            spellCheck={false}
          />
        </label>
        <Button data-ui="button" variant="secondary" size="small" className="leading-[1.4]" type="submit">
          Apply
        </Button>
        {(filtered || invalid) && (
          <Link
            href={href}
            className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 min-h-9.5 text-[13px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]"
            onClick={() => setValidation("")}
          >
            Clear filters
          </Link>
        )}
      </form>
      {(validation || invalid) && (
        <p role="alert" className={errorText}>
          {validation || invalid}
        </p>
      )}
      {!invalid && (
        <QueryState query={list} loading={<TableSkeleton columns={5} label="Loading deliveries…" />}>
          {items.length ? (
            <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border">
              <table data-ui="data-table" className={dataTable}>
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
                          className="font-mono text-accent underline decoration-transparent underline-offset-[3px] text-[11px] wrap-anywhere [&:hover]:decoration-current [[data-ui~='dashboard-main']_[data-ui~='data-table']_&]:text-[12px]"
                          href={
                            href +
                            "/" +
                            delivery.id +
                            (search.size ? "?" + search.toString() : "")
                          }
                        >
                          {delivery.id}
                        </Link>
                        <span className="font-mono block mt-1 text-muted text-[11px] wrap-anywhere [[data-ui~='dashboard-main']_[data-ui~='data-table']_&]:text-[12px]">
                          {delivery.endpoint_id}
                        </span>
                      </td>
                      <td>
                        <Status
                          tone={stateTone(delivery.state)}
                        >
                          {stateLabel(delivery.state)}
                        </Status>
                      </td>
                      <td>
                        {delivery.attempt_count}
                        <span className="block mt-1 text-[11px] text-muted">
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
            <div data-ui="empty-state" className={emptyState}>
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
