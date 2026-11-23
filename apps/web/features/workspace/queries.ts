import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Account, Organization, Page, Project } from "./types";
import { queryKeys } from "@/lib/query-keys";

type GetToken = () => Promise<string | null>;

export function accountQuery(userId: string, getToken: GetToken) {
  return queryOptions({
    queryKey: ["account", userId],
    queryFn: ({ signal }) =>
      apiRequest<Account>("/v1/me", getToken, { signal }),
  });
}

export function organizationsQuery(userId: string, getToken: GetToken) {
  return infiniteQueryOptions({
    queryKey: queryKeys.organizations(userId),
    initialPageParam: null as string | null,
    queryFn: async ({ client, pageParam, signal }) => {
      const page = await apiRequest<Page<Organization>>(
        "/v1/organizations",
        getToken,
        {
          signal,
          params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        },
      );
      // List rows match the detail response, so an organization opened from
      // the list doesn't wait on another round trip.
      for (const organization of page.data)
        client.setQueryData(
          queryKeys.organization(userId, organization.id),
          organization,
        );
      return page;
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

export function organizationQuery(
  userId: string,
  organizationId: string | undefined,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: queryKeys.organization(userId, organizationId),
    queryFn: organizationId
      ? ({ signal }) =>
          apiRequest<Organization>(
            "/v1/organizations/" + encodeURIComponent(organizationId),
            getToken,
            { signal },
          )
      : skipToken,
  });
}

export function projectQuery(
  userId: string,
  projectId: string | undefined,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: queryKeys.project(userId, projectId),
    queryFn: projectId
      ? ({ signal }) =>
          apiRequest<Project>(
            "/v1/projects/" + encodeURIComponent(projectId),
            getToken,
            { signal },
          )
      : skipToken,
  });
}

export function projectsQuery(
  userId: string,
  organizationId: string | undefined,
  getToken: GetToken,
) {
  return infiniteQueryOptions({
    queryKey: queryKeys.projects(userId, organizationId),
    initialPageParam: null as string | null,
    queryFn: organizationId
      ? async ({ client, pageParam, signal }) => {
          const page = await apiRequest<Page<Project>>(
            "/v1/organizations/" +
              encodeURIComponent(organizationId) +
              "/projects",
            getToken,
            {
              signal,
              params: {
                limit: 20,
                ...(pageParam ? { cursor: pageParam } : {}),
              },
            },
          );
          for (const project of page.data)
            client.setQueryData(queryKeys.project(userId, project.id), project);
          return page;
        }
      : skipToken,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

export function organizationHref(organizationId: string) {
  return "/dashboard?organization=" + encodeURIComponent(organizationId);
}
