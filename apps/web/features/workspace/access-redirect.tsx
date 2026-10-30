"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { notify } from "@/lib/notify";

const noticeParam = "notice";
const accessDeniedNotice = "access-denied";

export function AccessRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    const destination = new URL(href, window.location.origin);
    destination.searchParams.set(noticeParam, accessDeniedNotice);
    router.replace(
      destination.pathname + destination.search + destination.hash,
    );
  }, [href, router]);

  return (
    <p className="workspace-muted" role="status">
      Returning to your dashboard…
    </p>
  );
}

export function AccessRedirectNotice() {
  const notice = useSearchParams().get(noticeParam);

  useEffect(() => {
    if (notice !== accessDeniedNotice) return;
    const destination = new URL(window.location.href);
    // Consume the current URL so remounts cannot repeat the notification.
    if (destination.searchParams.get(noticeParam) !== accessDeniedNotice) return;
    destination.searchParams.delete(noticeParam);
    window.history.replaceState(
      null,
      "",
      destination.pathname + destination.search + destination.hash,
    );
    notify("You don't have permission to view that page.", "warn");
  }, [notice]);

  return null;
}
