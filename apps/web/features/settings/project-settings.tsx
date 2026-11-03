"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

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
      <dl className="flex flex-wrap pb-5 mt-0 mb-6 border-b [border-bottom-style:solid] border-b-border gap-7 [&_dt]:mb-1.25 [&_dt]:text-muted [&_dt]:text-[12px] [&_dd]:flex [&_dd]:items-center [&_dd]:flex-wrap [&_dd]:text-[13px] [&_dd]:wrap-anywhere [&_dd]:gap-2.5 [&_dd]:m-0 [&_code]:text-[12px] [&_code]:wrap-anywhere">
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
        <p data-ui="notice" className="rounded-lg bg-surface text-muted text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border">An owner or admin can rename this project.</p>
      )}
      <section data-ui="settings-section" className="mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
        <h3>Organization</h3>
        <Link
          className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
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
        <section data-ui="settings-section danger-zone" className="mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_>_p]:max-w-145 [&_>_p]:mb-5 [&_>_p]:text-muted [&_>_p]:text-[13px] [&_>_p]:leading-[1.8] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 in-data-[ui~='dashboard-main']:max-w-190 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
          <h3>Delete project</h3>
          <p>
            This permanently removes this project, its credentials, endpoints,
            and retained history. New activity is blocked as soon as deletion is
            accepted.
          </p>
          <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium max-w-115">
            <span>Type {project.name} to confirm</span>
            <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="off"
              disabled={remove.isPending}
            />
          </label>
          <Button
            type="button"
            data-ui="button" variant="secondary" className="text-danger"
            disabled={typedName !== project.name || remove.isPending}
            onClick={() => {
              remove.reset();
              setConfirmation(true);
            }}
          >
            Delete project
          </Button>
          {remove.isError && (
            <p className="text-danger text-[13px] my-3" role="alert">
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
