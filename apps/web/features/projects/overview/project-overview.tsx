"use client";

import { Button } from "@/components/button";

import { SetupSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { PlusIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ProjectEnvironment } from "@/features/projects/project-environment";
import { PageHeader } from "@/components/page-header";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { PublishEventDialog } from "@/features/activity/publish-event-dialog";
import { AgentSetupDialog } from "@/features/agent-setup/agent-setup-dialog";
import type { Endpoint } from "@/features/endpoints/types";
import { EndpointRegistrationDialog } from "@/features/endpoints/endpoint-registration-dialog";
import { useSessionUserId } from "@/features/workspace/session";
import { useProject } from "../project-workspace";
import { OverviewActivity } from "./overview-activity";
import { OverviewEndpoints } from "./overview-endpoints";
import { OverviewMetrics } from "./overview-metrics";
import { OverviewSetup } from "./overview-setup";
import { setupEndpointsQuery } from "./queries";
import { queryKeys } from "@/lib/query-keys";

export function ProjectOverview() {
  const { project, canManage, availabilityKnown, suspended } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const endpoints = useInfiniteQuery(
    setupEndpointsQuery(userId, project.id, getToken),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [publisher, setPublisher] = useState<{ endpoint?: Endpoint; } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [agentSiteOrigin, setAgentSiteOrigin] = useState<string | null>(null);
  const items = endpoints.data?.pages.flatMap((page) => page.data) ?? [];

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        endpoints.refetch(),
        ...[
          ["api-keys", userId, project.id, "overview-active"],
          ["project-overview", userId, project.id],
          queryKeys.events(userId, project.id),
          queryKeys.deliveries(userId, project.id),
          queryKeys.projectUsage(userId, project.id),
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section data-ui="project-overview" className="[container:project-overview/inline-size]" aria-labelledby="overview-heading">
      <PageHeader
        title="Overview"
        titleId="overview-heading"
        description={<span className="flex flex-wrap items-center gap-2">{project.description || "Delivery activity and receiver readiness across your project."}<ProjectEnvironment environment={project.environment} /></span>}
        actions={
          <>
            <RefreshButton
              pending={refreshing || endpoints.isFetching}
              refresh={refresh}
            />
            {canManage && (
              <Button
                type="button"
                data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
                onClick={() => setAgentSiteOrigin(window.location.origin)}
              >
                <TerminalWindowIcon size={16} aria-hidden="true" />
                Set up with AI
              </Button>
            )}
            {canManage && (
              <Button
                type="button"
                data-ui="button" size="small" className="leading-[1.4]"
                disabled={!availabilityKnown || suspended}
                onClick={() => setPublisher({})}
              >
                <PlusIcon size={16} aria-hidden="true" />
                Publish event
              </Button>
            )}
          </>
        }
      />
      <QueryState query={endpoints} loading={<SetupSkeleton />}>
        {endpoints.data && (
          <OverviewSetup
            endpoints={items}
            onPublish={(endpoint) => setPublisher({ endpoint })}
            onRegister={() => setRegistering(true)}
            loadMore={<LoadMore query={endpoints} label="Load more endpoints" />}
          />
        )}
      </QueryState>
      {canManage && <OverviewMetrics />}
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 @max-[55rem]/project-overview:grid-cols-[1fr]">
        <OverviewActivity endpoints={items} />
        <OverviewEndpoints
          endpoints={items}
          loading={endpoints.isPending}
          unavailable={endpoints.isError}
          hasMore={Boolean(endpoints.hasNextPage)}
          onRegister={() => setRegistering(true)}
        />
      </div>
      {canManage && registering && (
        <EndpointRegistrationDialog onClose={() => setRegistering(false)} />
      )}
      {canManage && agentSiteOrigin && (
        <AgentSetupDialog
          key={project.id}
          siteOrigin={agentSiteOrigin}
          onClose={() => setAgentSiteOrigin(null)}
        />
      )}
      {canManage && publisher && (
        <PublishEventDialog
          key={userId + ":" + project.id + ":" + (publisher.endpoint?.id ?? "all")}
          initialType={publisher.endpoint?.event_types[0]}
          eventTypes={publisher.endpoint?.event_types}
          onClose={() => setPublisher(null)}
        />
      )}
    </section>
  );
}
