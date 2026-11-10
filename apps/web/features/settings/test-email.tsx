"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/button";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { SettingsRow } from "./settings-layout";

type EmailTest = { id: string; state: string };
type RequestedTest = EmailTest & { requestedAt: number };
const messages: Record<string, string> = {
  queued: "Test email queued. Waiting for the email worker.", sending: "Sending your test email…",
  sent: "Accepted by the email provider. Check your inbox and spam folder.", delivered: "Test email delivered. Check your inbox.",
  failed: "The test email could not be sent. Check the worker and email provider configuration.",
  bounced: "The recipient address rejected the test email.", complained: "The provider reported a spam complaint.",
  suppressed: "The email provider suppressed delivery to this address.", cancelled: "Test email cancelled. Check your verified primary email and organization access.",
};

export function TestEmail({ organizationId, available }: { organizationId?: string; available: boolean }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const userId = useSessionUserId();
  const [requested, setRequested] = useState<RequestedTest | null>(null);
  const path = "/v1/organizations/" + encodeURIComponent(organizationId ?? "") + "/notification-email-test";
  const send = useMutation({ mutationFn: () => apiRequest<EmailTest>(path, getToken, { method: "POST" }),
    onSuccess: (data) => setRequested({ ...data, requestedAt: Date.now() }) });
  const status = useQuery({ queryKey: ["test-email", userId, organizationId, requested?.id], enabled: !!requested && !!organizationId,
    queryFn: ({ signal }) => apiRequest<EmailTest>(path + "/" + encodeURIComponent(requested?.id ?? ""), getToken, { signal }),
    refetchInterval: (query) => requested && Date.now() - requested.requestedAt < 60000 &&
      ["queued", "sending", "sent"].includes(query.state.data?.state ?? "queued") ? 2000 : false,
  });
  const state = status.data?.state ?? requested?.state;
  const verified = user?.primaryEmailAddress?.verification.status === "verified";
  return <>
    <SettingsRow title="Test email delivery" description={!organizationId ? "Join or select an organization to send a test email."
      : "Send one test to your verified primary email, even if alerts are muted. Limited to one request per minute."}>
      <Button type="button" variant="secondary" size="small" disabled={!organizationId || !available || !verified || send.isPending}
        onClick={() => send.mutate()}>{send.isPending ? "Requesting…" : "Send test email"}</Button>
    </SettingsRow>
    {(state || send.error || status.error) && <div className="pb-4 text-[12px]/7">
      {send.error || status.error ? <p role="alert" className="text-danger">{send.error?.message || status.error?.message}</p>
        : <p role="status" className="text-muted">{state && (messages[state] ?? "Checking email status…")}</p>}
    </div>}
  </>;
}
