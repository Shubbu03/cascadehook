import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingLoading } from "@/features/onboarding/ui/onboarding-loading";
import { OnboardingShell } from "@/features/onboarding/ui/onboarding-shell";
import { requireSession } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Set up your workspace",
  robots: { index: false, follow: false },
};

async function AuthenticatedSetup({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <OnboardingShell>{children}</OnboardingShell>;
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <AuthenticatedSetup>{children}</AuthenticatedSetup>
    </Suspense>
  );
}
