"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useId, useState } from "react";
import { Modal } from "@/components/modal";
import { ApiError, apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { NameForm } from "./name-form";
import { organizationHref } from "./queries";
import { useSessionUserId } from "./session";
import type { Organization, Project } from "./types";
import { queryKeys } from "@/lib/query-keys";

type CreateTarget =
  | { kind: "organization"; }
  | { kind: "project"; organization: Organization; };

type CreatedResource =
  | { kind: "organization"; organization: Organization; }
  | { kind: "project"; project: Project; };

type CreationActions = {
  createOrganization: () => void;
  createProject: (organization: Organization) => void;
};

const CreationContext = createContext<CreationActions | null>(null);

export function useWorkspaceCreation() {
  const actions = useContext(CreationContext);
  if (!actions) throw new Error("Workspace creation is unavailable.");
  return actions;
}

export function WorkspaceCreation({ children }: { children: React.ReactNode; }) {
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const router = useRouter();

  return (
    <CreationContext
      value={{
        createOrganization: () => setTarget({ kind: "organization" }),
        createProject: (organization) =>
          setTarget({ kind: "project", organization }),
      }}
    >
      {children}
      {target && (
        <CreateDialog
          key={
            target.kind === "organization"
              ? target.kind
              : target.organization.id
          }
          target={target}
          onCancel={() => setTarget(null)}
          onOrganizationCreated={(organization) => {
            router.push(organizationHref(organization.id));
            setTarget({ kind: "project", organization });
          }}
          onProjectCreated={(project) => {
            setTarget(null);
            router.push(
              "/dashboard/projects/" + encodeURIComponent(project.id),
            );
          }}
        />
      )}
    </CreationContext>
  );
}

function CreateDialog({
  target,
  onCancel,
  onOrganizationCreated,
  onProjectCreated,
}: {
  target: CreateTarget;
  onCancel: () => void;
  onOrganizationCreated: (organization: Organization) => void;
  onProjectCreated: (project: Project) => void;
}) {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const queryClient = useQueryClient();
  const titleId = useId();
  const create = useMutation({
    mutationFn: async (name: string): Promise<CreatedResource> => {
      if (target.kind === "organization") {
        const organization = await apiRequest<Organization>(
          "/v1/organizations",
          getToken,
          { method: "POST", data: { name } },
        );
        return { kind: "organization", organization };
      }
      const project = await apiRequest<Project>(
        "/v1/organizations/" +
        encodeURIComponent(target.organization.id) +
        "/projects",
        getToken,
        { method: "POST", data: { name } },
      );
      return { kind: "project", project };
    },
    onSuccess: (resource) => {
      if (resource.kind === "organization") {
        const { organization } = resource;
        queryClient.setQueryData(
          queryKeys.organization(userId, organization.id),
          organization,
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.organizations(userId),
        });
        notify("Organization created.", "success");
        onOrganizationCreated(organization);
      } else {
        const { project } = resource;
        queryClient.setQueryData(queryKeys.project(userId, project.id), project);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.projects(userId, project.organization_id),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.organizationUsage(userId, project.organization_id),
          refetchType: "all",
        });
        notify("Project created.", "success");
        onProjectCreated(project);
      }
    },
    onError: (error) => {
      if (
        target.kind === "project" &&
        error instanceof ApiError &&
        error.code === "project_name_exists"
      ) {
        return;
      }
      notify(error.message, "error");
    },
  });

  return (
    <Modal
      data-ui="workspace-create-dialog" className="w-[min(460px,calc(100%-40px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-7 border border-solid border-border [&_h2]:mb-7 [&_h2]:text-[24px] [&_h2]:tracking-[-0.035em] backdrop:bg-[#0008] max-[37.5rem]:p-6"
      aria-labelledby={titleId}
      onDismiss={onCancel}
      dismissDisabled={create.isPending}
    >
      {target.kind === "project" && (
        <p className="mb-2 text-muted text-[13px] wrap-anywhere">{target.organization.name}</p>
      )}
      <NameForm
        titleId={titleId}
        kind={target.kind}
        pending={create.isPending}
        error={create.error}
        onSubmit={(name) => create.mutate(name)}
        onCancel={onCancel}
      />
    </Modal>
  );
}
