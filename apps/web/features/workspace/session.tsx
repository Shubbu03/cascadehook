"use client";

import { buttonStyles } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { Notifications } from "@/components/notifications";
import { AccessRedirectNotice } from "./access-redirect";
import { WorkspaceLoading } from "./loading";
import { WorkspaceCreation } from "./workspace-creation";
import { DashboardShell } from "./dashboard-shell";

const UserIdContext = createContext<string | null>(null);

export function useSessionUserId() {
  const userId = useContext(UserIdContext);
  if (!userId) throw new Error("Workspace session is required.");
  return userId;
}

export function WorkspaceSession({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const session = useAuth();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  if (!session.isLoaded) return <WorkspaceLoading />;
  if (!session.isSignedIn || session.userId !== userId) {
    return (
      <main id="main-content" className="w-[min(1200px,calc(100%-80px))] pt-8 pb-16 mx-auto max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:pt-6 max-[37.5rem]:pb-12">
        <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
          <h1>Your session has changed.</h1>
          <p>Continue with your current account to load its workspace.</p>
          <a href="/dashboard" data-ui="button" className={buttonStyles()}>
            Continue
          </a>
        </div>
      </main>
    );
  }
  return (
    <UserIdContext value={userId}>
      <QueryClientProvider client={queryClient}>
        <Notifications>
          <AccessRedirectNotice />
          <WorkspaceCreation>
            <DashboardShell>{children}</DashboardShell>
          </WorkspaceCreation>
        </Notifications>
      </QueryClientProvider>
    </UserIdContext>
  );
}
