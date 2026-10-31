"use client";

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

export function NotificationInbox({ organizationId }: { organizationId: string }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const organization = useQuery(organizationQuery(userId, organizationId, getToken));
  return (
    <main id="main-content" className="dashboard-main">
      <QueryState query={organization} loading={<NotificationPageSkeleton />}>
        {organization.data && <InboxContent key={organizationId} organization={organization.data} />}
      </QueryState>
    </main>
  );
}

const states: { value: NotificationState; label: string }[] = [
  { value: "all", label: "All" }, { value: "unread", label: "Unread" },
  { value: "read", label: "Read" }, { value: "archived", label: "Archived" },
];

function InboxContent({ organization }: { organization: Organization }) {
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
    <div className="notification-inbox">
      <PageHeader title="Notifications"
        description={<>Your updates across <strong>{organization.name}</strong>. Read and archive states are personal to you.</>} />
      <div className="notification-inbox-controls">
        <div className="notification-tabs" role="group" aria-label="Notification state">
          {states.map((tab) => <button key={tab.value} type="button" aria-pressed={state === tab.value}
            onClick={() => setState(tab.value)}>{tab.label}</button>)}
        </div>
        <div className="notification-filters">
          <label className="filter-field">Category
            <Select value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | "")}>
              <option value="">All categories</option>
              {Object.entries(notificationCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="filter-field">Project
            <Select value={projectId} disabled={projects.isPending} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{projects.isPending ? "Loading projects…" : "All projects & organization"}</option>
              {projectItems.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </label>
          {filtered && <button type="button" className="button button-small button-quiet"
            onClick={() => { setCategory(""); setProjectId(""); }}>Clear filters</button>}
        </div>
      </div>
      {(projects.hasNextPage || projects.isError) && <div className="notification-project-options">
        {projects.isError && <p role="alert">Couldn’t load project filters. <button type="button" className="text-link" disabled={projects.isFetching}
          onClick={() => { void projects.refetch(); }}>Try again</button></p>}
        <LoadMore query={projects} label="Load more project options" />
      </div>}
      <div className="notification-list-panel">
        <NotificationFeed key={[state, category, projectId].join(":")}
          organizationId={organization.id} filters={{ state, category: category || undefined, projectId: projectId || undefined }} projectNames={projectNames} />
      </div>
      <p className="notification-inbox-note">Only updates for this organization appear here. Archiving an alert doesn’t resolve the underlying issue.</p>
    </div>
  );
}
