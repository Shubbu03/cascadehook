import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AcceptInvitation } from "@/features/settings/accept-invitation";
import { isAuthConfigured } from "@/lib/server/auth";
import { AccountLoading } from "@/features/workspace/loading";

export const metadata: Metadata = {
  title: "Join organization",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
async function Content() {
  await connection();
  if (!isAuthConfigured())
    return (
      <main id="main-content" className="page-width workspace-main">
        <h1>Account access unavailable</h1>
        <p>Please try again later.</p>
      </main>
    );
  return <AcceptInvitation />;
}
export default function Page() {
  return (
    <Suspense
      fallback={
        <AccountLoading />
      }
    >
      <Content />
    </Suspense>
  );
}
