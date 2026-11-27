import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingStart } from "@/features/billing/billing-start";
import { PageSkeleton } from "@/features/workspace/skeletons";

export const instant = false;
export const metadata: Metadata = { title: "Choose a plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton variant="usage" />}>
      <BillingStart />
    </Suspense>
  );
}
