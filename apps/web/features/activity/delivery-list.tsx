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
import { formatTime } from "@/lib/format";
import {
  deliveryFilters,
  deliveryStates,
  projectPath,
  stateTone,
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
              <input className="[[data-ui~='dashboard-main']_&]:accent-accent accent-accent size-4"
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
        data-ui="activity-filters" className="flex [align-items:end] flex-wrap mt-4.5 mb-6 gap-3 in-data-[ui~='dashboard-main']:mt-0 in-data-[ui~='dashboard-main']:mb-5 in-data-[ui~='dashboard-main']:pt-0 in-data-[ui~='dashboard-main']:pb-5 in-data-[ui~='dashboard-main']:border-b in-data-[ui~='dashboard-main']:[border-bottom-style:solid] in-data-[ui~='dashboard-main']:border-b-border in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:mx-0 in-data-[ui~='dashboard-main']:px-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:gap-2.5"
        onSubmit={apply}
      >
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>State</span>
          <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" name="state" defaultValue={search.get("state") ?? ""}>
            <option value="">All states</option>
            {deliveryStates.map((state) => (
              <option key={state} value={state}>
                {stateLabel(state)}
              </option>
            ))}
          </Select>
        </label>
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>Endpoint ID</span>
          <Input className="[[data-ui~='dashboard-main']_&]:w-55 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:px-2.5 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full min-w-0 w-52.5 py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
            name="endpoint_id"
            defaultValue={search.get("endpoint_id") ?? ""}
            placeholder="All endpoints"
            spellCheck={false}
          />
        </label>
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>Event ID</span>
          <Input className="[[data-ui~='dashboard-main']_&]:w-55 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:px-2.5 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full min-w-0 w-52.5 py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
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
            className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent min-h-9.5 text-[13px] in-data-[ui~='data-table']:text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
            onClick={() => setValidation("")}
          >
            Clear filters
          </Link>
        )}
      </form>
      {(validation || invalid) && (
        <p role="alert" className="text-danger text-[13px] my-3">
          {validation || invalid}
        </p>
      )}
      {!invalid && (
        <QueryState query={list} loading={<TableSkeleton columns={5} label="Loading deliveries…" />}>
          {items.length ? (
            <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border">
              <table data-ui="data-table" className="w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-top [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:[border-top-style:solid] [&_tr+tr_td]:border-t-border [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3">
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
            <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
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
