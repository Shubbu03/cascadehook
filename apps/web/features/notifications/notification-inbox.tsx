"use client";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState } from "@/components/query-state";
import { Select } from "@/components/select";
import { organizationQuery, projectsQuery } from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import type { Organization } from "@/features/workspace/types";
import { NotificationFeed } from "./notification-feed";
import { NotificationPageSkeleton } from "./notification-skeleton";
import { notificationCategories, type NotificationCategory, type NotificationState } from "./types";

export function NotificationInbox({ organizationId }: { organizationId: string; }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const organization = useQuery(organizationQuery(userId, organizationId, getToken));
  return (
    <main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
      <QueryState query={organization} loading={<NotificationPageSkeleton />}>
        {organization.data && <InboxContent key={organizationId} organization={organization.data} />}
      </QueryState>
    </main>
  );
}

const states: { value: NotificationState; label: string; }[] = [
  { value: "all", label: "All" }, { value: "unread", label: "Unread" },
  { value: "read", label: "Read" }, { value: "archived", label: "Archived" },
];

function InboxContent({ organization }: { organization: Organization; }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const [state, setState] = useState<NotificationState>("all");
  const [category, setCategory] = useState<NotificationCategory | "">("");
  const [projectId, setProjectId] = useState("");
  const projects = useInfiniteQuery(projectsQuery(userId, organization.id, getToken));
  const projectItems = projects.data?.pages.flatMap((page) => page.data) ?? [];
  const projectNames = new Map(projectItems.map((project) => [project.id, project.name]));
  const filtered = !!category || !!projectId;
  return (
    <div className="max-w-280">
      <PageHeader title="Notifications"
        description={<>Your updates across <strong>{organization.name}</strong>. Read and archive states are personal to you.</>} />
      <div className="flex items-end justify-between flex-wrap mb-5 gap-4 max-[37.5rem]:items-stretch">
        <div className={"flex items-center shrink-0 w-fit rounded-[7px] bg-background gap-1 p-0.75 border border-solid border-border [&_button]:min-h-7.5 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:text-muted [&_button]:text-[12px] [&_button]:font-medium [&_button]:whitespace-nowrap [&_button]:py-1 [&_button]:px-3 [&_button]:border-0 [&_button]:border-none [&_button]:border-current [&_button:hover]:text-foreground [&_button[aria-pressed=\"true\"]]:bg-surface-hover [&_button[aria-pressed=\"true\"]]:text-foreground pointer-coarse:[&_button]:min-h-10"} role="group" aria-label="Notification state">
          {states.map((tab) => <button key={tab.value} type="button" aria-pressed={state === tab.value}
            onClick={() => setState(tab.value)}>{tab.label}</button>)}
        </div>
        <div data-ui="notification-filters" className="flex items-end flex-wrap gap-3 max-[37.5rem]:items-stretch max-[37.5rem]:w-full">
          <label data-ui="filter-field" className="gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 flex flex-col text-muted text-[12px] max-[37.5rem]:flex-[1_1_140px] max-[37.5rem]:min-w-0">Category
            <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:max-w-none min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | "")}>
              <option value="">All categories</option>
              {Object.entries(notificationCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label data-ui="filter-field" className="gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 flex flex-col text-muted text-[12px] max-[37.5rem]:flex-[1_1_140px] max-[37.5rem]:min-w-0">Project
            <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:max-w-none min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" value={projectId} disabled={projects.isPending} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{projects.isPending ? "Loading projects…" : "All projects & organization"}</option>
              {projectItems.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </label>
          {filtered && <Button type="button" data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
            onClick={() => { setCategory(""); setProjectId(""); }}>Clear filters</Button>}
        </div>
      </div>
      {(projects.hasNextPage || projects.isError) && <div className="text-muted text-[12px] leading-[1.7] my-3.5">
        {projects.isError && <p role="alert">Couldn’t load project filters. <button type="button" className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]" disabled={projects.isFetching}
          onClick={() => { void projects.refetch(); }}>Try again</button></p>}
        <LoadMore query={projects} label="Load more project options" />
      </div>}
      <div className="overflow-hidden rounded-lg bg-surface border border-solid border-border">
        <NotificationFeed key={[state, category, projectId].join(":")}
          organizationId={organization.id} filters={{ state, category: category || undefined, projectId: projectId || undefined }} projectNames={projectNames} />
      </div>
      <p className="text-muted text-[12px] leading-[1.7] my-3.5">Only updates for this organization appear here. Archiving an alert doesn’t resolve the underlying issue.</p>
    </div>
  );
}
