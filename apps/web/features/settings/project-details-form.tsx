"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/button";
import { Textarea } from "@/components/input";
import { Select } from "@/components/select";
import { useSessionUserId } from "@/features/workspace/session";
import type { Project } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query-keys";

export function ProjectDetailsForm({ project, canManage }: { project: Project; canManage: boolean }) {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const client = useQueryClient();
  const [description, setDescription] = useState(project.description);
  const [environment, setEnvironment] = useState(project.environment);
  const save = useMutation({
    mutationFn: () => apiRequest<unknown>("/v1/projects/" + encodeURIComponent(project.id) + "/settings", getToken,
      { method: "PATCH", data: { description: description.trim(), environment } }),
    onSuccess: async () => {
      notify("Project details saved.", "success");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.project(userId, project.id) }),
        client.invalidateQueries({ queryKey: queryKeys.projects(userId, project.organization_id) }),
      ]);
    },
  });
  return (
    <form className="grid gap-4 border-b border-border py-5" onSubmit={(event) => { event.preventDefault(); if (canManage && !save.isPending) save.mutate(); }}>
      <label className="grid max-w-180 gap-2 text-[13px] font-medium">Description
        <Textarea value={description} rows={3} maxLength={500} disabled={!canManage || save.isPending}
          onChange={(event) => setDescription(event.target.value)} placeholder="What does this project deliver, and who uses it?"
          className="w-full resize-y rounded-md px-3 py-2.5 text-[14px]/6 font-normal max-[37.5rem]:text-[16px]" />
      </label>
      <label className="grid max-w-70 gap-2 text-[13px] font-medium">Environment
        <Select value={environment} disabled={!canManage || save.isPending} onChange={(event) => setEnvironment(event.target.value as Project["environment"])}
          className="min-h-10 rounded-md px-3 py-2 text-[13px] font-normal">
          <option value="">Not specified</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option>
        </Select>
      </label>
      {canManage && <Button type="submit" size="small" className="justify-self-start"
        disabled={save.isPending || (description.trim() === project.description && environment === project.environment)}>{save.isPending ? "Saving…" : "Save details"}</Button>}
      {save.error && <p role="alert" className="text-[13px] text-danger">{save.error.message}</p>}
    </form>
  );
}

