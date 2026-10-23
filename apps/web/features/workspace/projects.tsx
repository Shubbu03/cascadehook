"use client";

import { useAuth } from "@clerk/nextjs";
import { FolderSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { ConnectionError } from "./connection-error";
import { NameForm } from "./name-form";
import type { Organization, Page, Project } from "./types";

export function Projects({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const queryKey = ["projects", userId, organization.id];
  const projects = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Project>>(
        "/v1/organizations/" + organization.id + "/projects",
        getToken,
        {
          signal,
          params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        },
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const create = useMutation({
    mutationFn: (name: string) =>
      apiRequest<Project>(
        "/v1/organizations/" + organization.id + "/projects",
        getToken,
        { method: "POST", data: { name } },
      ),
    onSuccess: (project) => {
      queryClient.setQueryData<InfiniteData<Page<Project>>>(
        queryKey,
        (previous) => {
          if (!previous)
            return {
              pages: [{ data: [project], next_cursor: null }],
              pageParams: [null],
            };
          return {
            ...previous,
            pages: previous.pages.map((page, index) =>
              index === 0
                ? {
                    ...page,
                    data: [
                      project,
                      ...page.data.filter((item) => item.id !== project.id),
                    ],
                  }
                : page,
            ),
          };
        },
      );
      setCreating(false);
      notify("Project created.", "success");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => notify(error.message, "error"),
  });
  const items = projects.data?.pages.flatMap((page) => page.data) ?? [];
  const canCreate =
    organization.role === "owner" || organization.role === "admin";

  return (
    <section aria-label="Organization projects">
      <div className="workspace-section-heading">
        <div>
          <h2>{organization.name}</h2>
          <p>Projects give each application its own space.</p>
        </div>
        {canCreate && items.length > 0 && !creating && (
          <button
            type="button"
            className="button button-small button-secondary"
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            <PlusIcon size={16} aria-hidden="true" />
            New project
          </button>
        )}
      </div>
      {projects.isPending ? (
        <div className="workspace-loading" role="status">
          <span className="sr-only">Loading projects…</span>
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : projects.isError && !projects.data ? (
        <ConnectionError
          error={projects.error}
          retry={() => {
            void projects.refetch();
          }}
          pending={projects.isFetching}
        />
      ) : (
        <>
          {projects.isError && (
            <ConnectionError
              error={projects.error}
              retry={() => {
                void projects.refetch();
              }}
              pending={projects.isFetching}
            />
          )}
          {canCreate && (creating || items.length === 0) && (
            <NameForm
              kind="project"
              pending={create.isPending}
              error={create.error}
              onSubmit={(name) => create.mutate(name)}
              onCancel={items.length ? () => setCreating(false) : undefined}
            />
          )}
          {!canCreate && items.length === 0 && (
            <div className="empty-state">
              <FolderSimpleIcon size={28} aria-hidden="true" />
              <h3>No projects yet.</h3>
              <p>
                An owner or admin can create your organization&apos;s first
                project.
              </p>
            </div>
          )}
          <div className="project-list">
            {items.map((project) => (
              <article key={project.id} className="project-item">
                <div className="project-item-heading">
                  <h3>
                    <FolderSimpleIcon
                      size={20}
                      className="text-accent"
                      aria-hidden="true"
                    />
                    {project.name}
                  </h3>
                  <span className="status status-neutral">{project.role}</span>
                </div>
                <code className="project-id">{project.id}</code>
                <CopyButton
                  value={project.id}
                  label="Copy project ID"
                  successMessage="Project ID copied."
                />
              </article>
            ))}
          </div>
          {projects.hasNextPage && (
            <button
              type="button"
              className="button button-quiet"
              disabled={projects.isFetchingNextPage}
              onClick={() => {
                void projects.fetchNextPage();
              }}
            >
              {projects.isFetchingNextPage ? "Loading…" : "Load more projects"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
