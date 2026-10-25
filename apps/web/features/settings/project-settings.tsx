"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { organizationHref } from "@/features/workspace/queries";
import type { Page, Project } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { RenameForm } from "./rename-form";

export function ProjectSettings() {
  const { project, canManage } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  const [typedName, setTypedName] = useState("");
  const path = "/v1/projects/" + encodeURIComponent(project.id);
  const remove = useMutation({
    mutationFn: () => apiRequest<unknown>(path, getToken, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmation(false);
      notify("Project deletion requested.", "success");
      const queryKey = ["projects", userId, project.organization_id];
      await client.cancelQueries({ queryKey });
      client.setQueriesData<InfiniteData<Page<Project>>>(
        { queryKey },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  data: page.data.filter((item) => item.id !== project.id),
                })),
              }
            : data,
      );
      void client.invalidateQueries({ queryKey, refetchType: "none" });
      void client.invalidateQueries({
        queryKey: ["usage", userId, "organization", project.organization_id],
        refetchType: "all",
      });
      router.replace(organizationHref(project.organization_id));
      router.refresh();
    },
    onError: (error) => {
      setConfirmation(false);
      notify(error.message, "error");
    },
  });

  return (
    <section>
      <PageHeader title="Project settings" />
      <dl className="settings-identity">
        <div>
          <dt>Project ID</dt>
          <dd>
            <code>{project.id}</code>
            <CopyButton value={project.id} label="Copy ID" />
          </dd>
        </div>
        <div>
          <dt>Your role</dt>
          <dd>{project.role}</dd>
        </div>
      </dl>
      {canManage ? (
        <RenameForm
          kind="Project"
          name={project.name}
          path={path}
          saved={() =>
            Promise.all([
              client.invalidateQueries({
                queryKey: ["project", userId, project.id],
              }),
              client.invalidateQueries({
                queryKey: ["projects", userId, project.organization_id],
              }),
            ])
          }
        />
      ) : (
        <p className="notice">An owner or admin can rename this project.</p>
      )}
      <section className="settings-section">
        <h3>Organization</h3>
        <Link
          className="text-link"
          href={
            "/dashboard/organizations/" +
            encodeURIComponent(project.organization_id) +
            "/settings"
          }
        >
          Manage organization and team →
        </Link>
      </section>
      {project.role === "owner" && (
        <section className="settings-section danger-zone">
          <h3>Delete project</h3>
          <p>
            This permanently removes this project, its credentials, endpoints,
            and retained history. New activity is blocked as soon as deletion is
            accepted.
          </p>
          <label className="form-field">
            <span>Type {project.name} to confirm</span>
            <input
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
              disabled={remove.isPending}
            />
          </label>
          <button
            type="button"
            className="button button-secondary text-danger"
            disabled={typedName !== project.name || remove.isPending}
            onClick={() => {
              remove.reset();
              setConfirmation(true);
            }}
          >
            Delete project
          </button>
          {remove.isError && (
            <p className="form-error" role="alert">
              {remove.error.message}
            </p>
          )}
        </section>
      )}
      {confirmation && (
        <ConfirmDialog
          title="Permanently delete this project?"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmation(false)}
        >
          <p>
            {project.name} and its data will be removed. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
