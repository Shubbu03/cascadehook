import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  WorkspaceHome,
  WorkspaceLoading,
} from "@/features/workspace/workspace-home";
import { isAuthConfigured } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Your workspace",
  robots: { index: false, follow: false },
};

async function AuthenticatedWorkspace() {
  await connection();
  if (!isAuthConfigured()) redirect("/sign-in");
  const { userId } = await auth.protect();
  return <WorkspaceHome key={userId} userId={userId} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AuthenticatedWorkspace />
    </Suspense>
  );
}
