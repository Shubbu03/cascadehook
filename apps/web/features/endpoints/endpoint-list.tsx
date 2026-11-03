"use client";

import { Status } from "@/components/status";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

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
import { useId, useState, type SubmitEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { ConnectionError } from "@/features/workspace/connection-error";
import { TableSkeleton } from "@/features/workspace/skeletons";
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

  function applyFilter(event: SubmitEvent<HTMLFormElement>) {
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
            <Button
              type="button"
              data-ui="button"
              disabled={suspended || !availabilityKnown}
              onClick={() => setRegistering(true)}
            >
              <PlusIcon size={17} aria-hidden="true" />
              Register endpoint
            </Button>
          )
        }
      />
      {canManage && (registering || registrationRequested) && (
        <EndpointRegistrationDialog
          onClose={closeRegistration}
          onRegistered={() => setRegistering(false)}
        />
      )}
      <div data-ui="endpoint-toolbar" className="flex [align-items:end] flex-wrap pt-0.5 pb-6.25 gap-3.5 in-data-[ui~='dashboard-main']:mt-0 in-data-[ui~='dashboard-main']:mb-5 in-data-[ui~='dashboard-main']:pt-0 in-data-[ui~='dashboard-main']:pb-5 in-data-[ui~='dashboard-main']:border-b in-data-[ui~='dashboard-main']:[border-bottom-style:solid] in-data-[ui~='dashboard-main']:border-b-border in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:mx-0 in-data-[ui~='dashboard-main']:px-0 max-[32.5rem]:gap-3.75 max-[37.5rem]:in-data-[ui~='dashboard-main']:gap-2.5">
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='event-filter']:min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[32.5rem]:[[data-ui~='endpoint-toolbar']_>_&]:flex-1 max-[32.5rem]:in-data-[ui~='event-filter']:flex-1">
          <span>Status</span>
          <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
            value={enabled}
            onChange={(event) => setEnabled(event.target.value)}
          >
            <option value="">All endpoints</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </Select>
        </label>
        <form data-ui="event-filter" className="flex [align-items:end] min-w-0 gap-2 max-[32.5rem]:w-full max-[32.5rem]:order-3" onSubmit={applyFilter}>
          <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[32.5rem]:[[data-ui~='endpoint-toolbar']_>_&]:flex-1 max-[32.5rem]:flex-1" htmlFor={id}>
            <span>Event type</span>
            <Input className="[[data-ui~='dashboard-main']_&]:w-55 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:px-2.5 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[32.5rem]:w-full min-h-10.5 rounded-md text-foreground text-[14px] max-w-full min-w-0 w-52.5 py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
              id={id}
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
              placeholder="e.g. invoice.paid"
              spellCheck={false}
              aria-invalid={Boolean(filterError)}
              aria-describedby={filterError ? id + "-error" : undefined}
            />
          </label>
          <Button
            type="submit"
            data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
          >
            Apply
          </Button>
        </form>
        <Button
          type="button"
          data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
          onClick={() => {
            void list.refetch();
          }}
          disabled={list.isFetching}
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {list.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {filterError && (
        <p id={id + "-error"} className="text-danger text-[13px] my-3" role="alert">
          {filterError}
        </p>
      )}
      {filtered && (
        <div className="flex items-center justify-between flex-wrap pb-4.5 gap-3">
          <span className="text-muted text-[13px]">
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
            className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
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
        <TableSkeleton columns={2} label="Loading endpoints…" />
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
            <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
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
                <Button
                  type="button"
                  data-ui="button" variant="secondary"
                  onClick={() => setRegistering(true)}
                >
                  Register an endpoint
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] bg-surface overflow-hidden border border-solid border-border">
              <div className="grid grid-cols-[1fr_150px] pr-12.5 pl-5 bg-background text-[12px] text-muted border-b [border-bottom-style:solid] border-b-border gap-5 py-3.25 max-[65.625rem]:grid-cols-[1fr_120px] max-[32.5rem]:hidden" aria-hidden="true">
                <span>Destination and subscriptions</span>
                <span>Delivery</span>
              </div>
              {items.map((endpoint) => (
                <Link
                  key={endpoint.id}
                  data-ui="endpoint-row" className="grid grid-cols-[minmax(0,1fr)_150px_17px] items-center gap-5 p-5 [&_>_svg]:text-muted [[data-ui~='endpoint-row']+&]:border-t [[data-ui~='endpoint-row']+&]:[border-top-style:solid] [[data-ui~='endpoint-row']+&]:border-t-border [&:hover]:bg-surface-hover max-[65.625rem]:grid-cols-[minmax(0,1fr)_120px_17px] max-[65.625rem]:gap-3.5 max-[32.5rem]:grid-cols-[minmax(0,1fr)_17px] max-[32.5rem]:gap-3 max-[32.5rem]:p-4.5 max-[32.5rem]:[&_>_svg]:col-2 max-[32.5rem]:[&_>_svg]:row-[1/3]"
                  href={href + "/" + encodeURIComponent(endpoint.id)}
                >
                  <div className="min-w-0 grid gap-2">
                    <span className="block wrap-anywhere font-mono text-[13px] leading-[1.7]">{endpoint.url}</span>
                    <span className="text-muted text-[12px] wrap-anywhere">
                      {endpoint.event_types.slice(0, 3).join(" · ")}
                      {endpoint.event_types.length > 3
                        ? " · +" + (endpoint.event_types.length - 3) + " more"
                        : ""}
                    </span>
                  </div>
                  <Status
                    tone={(endpoint.enabled ? "success" : "neutral")}
                  >
                    {endpointState(endpoint)}
                  </Status>
                  <ArrowRightIcon size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
          {list.hasNextPage && (
            <Button
              type="button"
              data-ui="button" variant="quiet" className="mt-3.75"
              disabled={list.isFetching}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more endpoints"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
