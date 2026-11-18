"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  resolveSetup,
  setupPath,
  type SetupState,
} from "@/features/onboarding/data-access/setup-state";
import { dashboardMain } from "@/components/styles";
import { apiRequest } from "@/lib/api";
import { ConnectionError } from "./connection-error";
import { accountQuery } from "./queries";
import { useSessionUserId } from "./session";

// Sends accounts that haven't finished onboarding to setup. It runs in the
// browser so the dashboard's own requests start in parallel with /v1/me
// instead of waiting for a server round trip to the API.
export function SetupGate({ children }: { children: React.ReactNode }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const setup = useQuery({
    queryKey: ["workspace-setup", userId],
    queryFn: async ({ signal }): Promise<SetupState> => {
      const account = await client.fetchQuery(accountQuery(userId, getToken));
      if (account.onboarding_completed_at) return { step: "ready" };
      return resolveSetup(
        <T,>(path: string, params?: Record<string, string | number>) =>
          apiRequest<T>(path, getToken, { signal, params }),
      );
    },
    // An unfinished setup must be re-checked, or a stale result would send
    // someone who just finished onboarding back to it.
    staleTime: (query) => (query.state.data?.step === "ready" ? Infinity : 0),
  });
  const redirectTo =
    setup.data && setup.data.step !== "ready" && !setup.isFetching
      ? setupPath(setup.data)
      : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (setup.isError)
    return (
      <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
        <ConnectionError
          title="Couldn't load setup"
          error={setup.error}
          retry={() => {
            void setup.refetch();
          }}
          pending={setup.isFetching}
        />
      </main>
    );
  return children;
}
