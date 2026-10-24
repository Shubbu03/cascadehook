"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { organizationQuery, organizationsQuery, projectQuery } from "./queries";
import { useSessionUserId } from "./session";

export function useWorkspaceSelection() {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId =
    typeof params.projectId === "string" ? params.projectId : undefined;
  const organizations = useInfiniteQuery(organizationsQuery(userId, getToken));
  const project = useQuery(projectQuery(userId, projectId, getToken));
  const organizationId = projectId
    ? project.data?.organization_id
    : searchParams.get("organization") || organizations.data?.pages[0]?.data[0]?.id;
  const organization = useQuery(
    organizationQuery(userId, organizationId, getToken),
  );

  return { organization, organizations, project, projectId };
}
