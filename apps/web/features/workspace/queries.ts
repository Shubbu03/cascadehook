import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { Organization, Page, Project } from "./types";

type GetToken = () => Promise<string | null>;

export function organizationsQuery(userId: string, getToken: GetToken) {
  return infiniteQueryOptions({
    queryKey: ["organizations", userId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Organization>>("/v1/organizations", getToken, {
        signal,
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

export function organizationQuery(
  userId: string,
  organizationId: string | undefined,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["organization", userId, organizationId],
    queryFn: organizationId ? ({ signal }) =>
      apiRequest<Organization>(
        "/v1/organizations/" + encodeURIComponent(organizationId),
        getToken,
        { signal },
      ) : skipToken,
  });
}

export function projectQuery(
  userId: string,
  projectId: string | undefined,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["project", userId, projectId],
    queryFn: projectId ? ({ signal }) =>
      apiRequest<Project>(
        "/v1/projects/" + encodeURIComponent(projectId),
        getToken,
        { signal },
      ) : skipToken,
  });
}

export function projectsQuery(
  userId: string,
  organizationId: string | undefined,
  getToken: GetToken,
) {
  return infiniteQueryOptions({
    queryKey: ["projects", userId, organizationId],
    initialPageParam: null as string | null,
    queryFn: organizationId ? ({ pageParam, signal }) =>
      apiRequest<Page<Project>>(
        "/v1/organizations/" + encodeURIComponent(organizationId) + "/projects",
        getToken,
        {
          signal,
          params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        },
      ) : skipToken,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

export function organizationHref(organizationId: string) {
  return "/dashboard?organization=" + encodeURIComponent(organizationId);
}
