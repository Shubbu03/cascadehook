"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import { QueryState } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { SettingsSection } from "./settings-layout";

type Policy = { max_attempts: number; timeout_seconds: number; retry_delays_seconds: number[] };

export function DeliveryPolicySettings({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const path = "/v1/projects/" + encodeURIComponent(projectId) + "/delivery-policy";
  const policy = useQuery({ queryKey: ["delivery-policy", userId, projectId],
    queryFn: ({ signal }) => apiRequest<Policy>(path, getToken, { signal }) });
  return <QueryState query={policy}>{policy.data && <PolicyForm key={JSON.stringify(policy.data)} projectId={projectId} policy={policy.data} canManage={canManage} />}</QueryState>;
}

function PolicyForm({ policy, projectId, canManage }: { policy: Policy; projectId: string; canManage: boolean }) {
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const client = useQueryClient();
  const [maxAttempts, setMaxAttempts] = useState(policy.max_attempts);
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(policy.timeout_seconds));
  const [delays, setDelays] = useState(policy.retry_delays_seconds.map(String));
  const [validation, setValidation] = useState("");
  const path = "/v1/projects/" + encodeURIComponent(projectId) + "/delivery-policy";
  const save = useMutation({ mutationFn: (data: Policy) => apiRequest<Policy>(path, getToken, { method: "PATCH", data }),
    onSuccess: (data) => { client.setQueryData(["delivery-policy", userId, projectId], data); notify("Delivery policy saved.", "success"); },
    onSettled: () => client.invalidateQueries({ queryKey: ["delivery-policy", userId, projectId] }) });
  const disabled = !canManage || save.isPending;
  return <SettingsSection title="Delivery policy" description="Defaults for new events and manual replays. Existing delivery cycles retain the policy they started with.">
    <form className="grid gap-5 py-5" onSubmit={(event) => {
      event.preventDefault();
      const seconds = Number(timeoutSeconds);
      const retryDelays = delays.map((delay,index) => index < maxAttempts - 1 ? Number(delay) : Math.max(Number(delay), Number(delays[maxAttempts - 2] ?? 1)));
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 30 || retryDelays.some((value, index) =>
        !Number.isInteger(value) || value < 1 || value > 64800 || (index > 0 && value < retryDelays[index - 1]))) {
        setValidation("Use a timeout of 1–30 seconds and increasing retry delays of 1–64,800 seconds."); return;
      }
      setValidation("");
      if (canManage && !save.isPending) save.mutate({ max_attempts: maxAttempts, timeout_seconds: seconds, retry_delays_seconds: retryDelays });
    }}>
      <div className="grid max-w-160 gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-[13px]">Total attempts
          <Select value={maxAttempts} disabled={disabled} onChange={(event) => setMaxAttempts(Number(event.target.value))} className="min-h-10 rounded-md px-3 py-2">
            {Array.from({ length: 8 }, (_, index) => <option key={index} value={index + 1}>{index + 1}{index === 0 ? " (no retries)" : ""}</option>)}
          </Select>
        </label>
        <label className="grid gap-2 text-[13px]">Request timeout (seconds)
          <Input type="number" min={1} max={30} step={1} required value={timeoutSeconds} disabled={disabled} onChange={(event) => setTimeoutSeconds(event.target.value)} className="min-h-10 rounded-md px-3 py-2" />
        </label>
      </div>
      {maxAttempts > 1 && <fieldset><legend className="mb-3 text-[13px] font-medium">Delay before each retry (seconds)</legend>
        <div className="grid max-w-180 grid-cols-2 gap-3 sm:grid-cols-4">
          {delays.slice(0, maxAttempts - 1).map((delay, index) => <label key={index} className="grid gap-2 text-[12px] text-muted">Retry {index + 1}
            <Input type="number" min={1} max={64800} step={1} required value={delay} disabled={disabled}
              onChange={(event) => setDelays((current) => current.map((value, item) => item === index ? event.target.value : value))}
              className="min-h-10 rounded-md px-3 py-2 text-[13px] text-foreground" />
          </label>)}
        </div>
      </fieldset>}
      <p className="max-w-175 text-[12px]/7 text-muted">The first attempt is immediate. Retry delays include ±20% jitter; a receiver’s Retry-After header can extend them. All cycles have a 72-hour retry window.</p>
      {canManage ? <Button type="submit" size="small" className="justify-self-start" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save policy"}</Button>
        : <p className="text-[12px] text-muted">An owner or admin can change the delivery policy.</p>}
      {(validation || save.error) && <p role="alert" className="text-[13px] text-danger">{validation || save.error?.message}</p>}
      {save.isSuccess && <p role="status" className="text-[12px] text-success">Delivery policy saved.</p>}
    </form>
  </SettingsSection>;
}
