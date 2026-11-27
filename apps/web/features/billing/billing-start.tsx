"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { dashboardMain, leadText, textLink } from "@/components/styles";
import { ConnectionError } from "@/features/workspace/connection-error";
import { organizationsQuery } from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { billingHref, plans } from "@/lib/plans";
import { intentQuery, readIntent, saveIntent } from "./intent";

// Entry point from the pricing page: finds the organization to bill and opens its
// billing page with the chosen plan, without starting a payment on its own.
export function BillingStart() {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const intent = useMemo(() => readIntent(params), [params]);
  const organizations = useInfiniteQuery(organizationsQuery(userId, getToken));
  const list = organizations.data?.pages.flatMap((page) => page.data) ?? [];
  const owned = list.filter((organization) => organization.role === "owner");
  const loaded = organizations.isSuccess;
  const destination = !intent ? "/pricing" : !loaded ? null
    : owned.length === 1 ? billingHref(owned[0].id) + "?" + intentQuery(intent)
    : list.length === 0 ? "/dashboard" : null;

  useEffect(() => {
    if (!destination) return;
    // A new account goes through onboarding first; the dashboard brings it back here afterwards.
    if (intent && destination === "/dashboard") saveIntent(intent);
    router.replace(destination);
  }, [destination, intent, router]);

  const plan = plans.find((candidate) => candidate.id === intent?.plan);
  return (
    <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
      {organizations.isError ? (
        <ConnectionError error={organizations.error} retry={() => void organizations.refetch()} pending={organizations.isFetching} />
      ) : destination || !loaded || !intent || !plan ? (
        <PageSkeleton variant="usage" />
      ) : (
        <section>
          <PageHeader title={`Choose where to use ${plan.name}`} />
          {owned.length > 0 ? (
            <>
              <p className={leadText}>A plan belongs to one organization. Pick the one to upgrade.</p>
              <ul className="mt-6 grid max-w-140 list-none gap-2 p-0">
                {owned.map((organization) => (
                  <li key={organization.id}>
                    <Link href={billingHref(organization.id) + "?" + intentQuery(intent)}
                      className="flex min-h-12 items-center justify-between rounded-lg border border-solid border-border px-4 text-[14px] transition-colors hover:bg-surface-hover">
                      {organization.name}<span className="text-muted text-[12px]">Continue</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={leadText}>
              Only an organization owner can buy a plan. Ask an owner of {list.map((organization) => organization.name).join(", ")} to
              upgrade, or <Link className={textLink} href="/dashboard">go to your dashboard</Link>.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
