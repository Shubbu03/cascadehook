import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AcceptInvitation } from "@/features/settings/accept-invitation";
import { MagicInvitation } from "@/features/settings/magic-invitation";
import { uuidPattern } from "@/lib/format";
import { notFound } from "next/navigation";
import { isAuthConfigured } from "@/lib/server/auth";
import { AccountLoading } from "@/features/workspace/loading";

export const metadata: Metadata = {
  title: "Join organization",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
type PageProps = { searchParams: Promise<{ invitation?: string | string[]; __clerk_ticket?: string | string[] }> };
async function Content({ searchParams }: PageProps) {
  await connection();
  if (!isAuthConfigured())
    return (
      <main id="main-content" className="page-width workspace-main">
        <h1>Account access unavailable</h1>
        <p>Please try again later.</p>
      </main>
    );
  const params = await searchParams;
  if (params.invitation) {
    if (typeof params.invitation !== "string" || !uuidPattern.test(params.invitation)) notFound();
    if (params.__clerk_ticket !== undefined && typeof params.__clerk_ticket !== "string") notFound();
    return <MagicInvitation key={params.invitation} invitationId={params.invitation} ticket={params.__clerk_ticket} />;
  }
  return <AcceptInvitation />;
}
export default function Page(props: PageProps) {
  return (
    <Suspense
      fallback={
        <AccountLoading />
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
