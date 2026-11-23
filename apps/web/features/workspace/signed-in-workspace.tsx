import { Suspense } from "react";
import { requireSession } from "@/lib/server/session";
import { WorkspaceLoading } from "./loading";
import { WorkspaceSession } from "./session";

async function Session({ children }: { children: React.ReactNode }) {
  const { userId } = await requireSession();
  return (
    <WorkspaceSession key={userId} userId={userId}>
      {children}
    </WorkspaceSession>
  );
}

// One session, query cache, and shell for every signed-in page, so moving
// between the dashboard, organization pages, and account settings keeps both.
export function SignedInWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <Session>{children}</Session>
    </Suspense>
  );
}
