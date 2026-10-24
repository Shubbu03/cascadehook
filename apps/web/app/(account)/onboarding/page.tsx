import { Suspense } from "react";
import { OnboardingStep } from "@/features/onboarding/onboarding-step";
import { OnboardingLoading } from "@/features/onboarding/ui/onboarding-loading";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingStep step="entry" />
    </Suspense>
  );
}
