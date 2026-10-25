import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  setupPath,
  type SetupState,
} from "@/features/onboarding/data-access/setup-state";
import { getWorkspaceSetup } from "@/features/onboarding/data-access/workspace-setup";
import { OnboardingError } from "@/features/onboarding/onboarding-error";
import { OnboardingShell } from "@/features/onboarding/ui/onboarding-shell";
import { WorkspaceLoading } from "@/features/workspace/loading";
import { WorkspaceSession } from "@/features/workspace/session";
import { requireSession } from "@/lib/server/session";
import { ApiError } from "@/lib/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function DashboardSession({ children }: { children: React.ReactNode }) {
  const { userId } = await requireSession();
  let setup: SetupState;
  try {
    setup = await getWorkspaceSetup();
  } catch (error) {
    return (
      <OnboardingShell>
        <OnboardingError
          message={
            error instanceof ApiError ? error.message : "Please try again."
          }
        />
      </OnboardingShell>
    );
  }
  if (setup.step !== "ready") redirect(setupPath(setup));
  return (
    <WorkspaceSession key={userId} userId={userId}>
      {children}
    </WorkspaceSession>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <DashboardSession>{children}</DashboardSession>
    </Suspense>
  );
}
