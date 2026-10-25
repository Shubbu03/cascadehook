"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { NameForm } from "./name-form";
import { organizationHref } from "./queries";
import { useSessionUserId } from "./session";
import type { Organization, Project } from "./types";

type CreateTarget =
  | { kind: "organization" }
  | { kind: "project"; organization: Organization };

type CreatedResource =
  | { kind: "organization"; organization: Organization }
  | { kind: "project"; project: Project };

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

export function WorkspaceCreation({ children }: { children: React.ReactNode }) {
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
  const dialog = useRef<HTMLDialogElement>(null);
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
          ["organization", userId, organization.id],
          organization,
        );
        void queryClient.invalidateQueries({
          queryKey: ["organizations", userId],
        });
        notify("Organization created.", "success");
        onOrganizationCreated(organization);
      } else {
        const { project } = resource;
        queryClient.setQueryData(["project", userId, project.id], project);
        void queryClient.invalidateQueries({
          queryKey: ["projects", userId, project.organization_id],
        });
        notify("Project created.", "success");
        onProjectCreated(project);
      }
    },
    onError: (error) => notify(error.message, "error"),
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="workspace-create-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!create.isPending) onCancel();
      }}
    >
      {target.kind === "project" && (
        <p className="workspace-create-context">{target.organization.name}</p>
      )}
      <NameForm
        titleId={titleId}
        kind={target.kind}
        pending={create.isPending}
        error={create.error}
        onSubmit={(name) => create.mutate(name)}
        onCancel={onCancel}
      />
    </dialog>
  );
}
