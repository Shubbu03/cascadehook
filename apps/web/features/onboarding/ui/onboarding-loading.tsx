import { Skeleton } from "@/components/skeleton";
import { FormSkeleton } from "@/features/workspace/skeletons";

export function OnboardingLoading() {
  return (
    <main id="main-content" className="w-[min(460px,calc(100%-40px))] mx-auto">
      <div className="flex flex-wrap mb-5 pb-5 border-b [border-bottom-style:solid] border-b-border gap-3" aria-hidden="true">
        <Skeleton width={130} height={20} />
        <Skeleton width={100} height={20} />
      </div>
      <div data-ui="onboarding-card" className="rounded-xl bg-surface p-8 border border-solid border-border [&_h1]:text-[26px] [&_h1]:tracking-[-0.035em] [&_form]:mt-7 max-[37.5rem]:p-6 max-[37.5rem]:[&_h1]:text-[24px]">
        <div className="flex items-center justify-between flex-wrap gap-4 [[data-ui~='onboarding-card']_>_&]:mb-6.5 [[data-ui~='skeleton-page']_>_[aria-hidden]_>_&]:mb-6" aria-hidden="true">
          <Skeleton width="75%" height={26} />
        </div>
        <FormSkeleton fields={1} label="Loading setup…" />
      </div>
    </main>
  );
}
