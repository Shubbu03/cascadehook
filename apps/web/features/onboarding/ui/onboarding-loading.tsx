import { Skeleton } from "@/components/skeleton";
import { FormSkeleton } from "@/features/workspace/skeletons";

export function OnboardingLoading() {
  return (
    <main id="main-content" className="onboarding-content">
      <div className="skeleton-filters" aria-hidden="true">
        <Skeleton width={130} height={20} />
        <Skeleton width={100} height={20} />
      </div>
      <div className="onboarding-card">
        <div className="skeleton-heading" aria-hidden="true">
          <Skeleton width="75%" height={26} />
        </div>
        <FormSkeleton fields={1} label="Loading setup…" />
      </div>
    </main>
  );
}
