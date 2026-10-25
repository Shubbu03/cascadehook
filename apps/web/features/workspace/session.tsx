"use client";

import { useAuth } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
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
      <main id="main-content" className="page-width workspace-main">
        <div className="empty-state">
          <h1>Your session has changed.</h1>
          <p>Continue with your current account to load its workspace.</p>
          <a href="/dashboard" className="button button-primary">
            Continue
          </a>
        </div>
      </main>
    );
  }
  return (
    <UserIdContext value={userId}>
      <QueryClientProvider client={queryClient}>
        <WorkspaceCreation>
          <DashboardShell>{children}</DashboardShell>
        </WorkspaceCreation>
      </QueryClientProvider>
    </UserIdContext>
  );
}
