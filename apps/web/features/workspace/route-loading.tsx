"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton, type PageSkeletonVariant } from "./skeletons";

function RouteSkeleton() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  let variant: PageSkeletonVariant = "projects";
  if (segments[0] === "account") variant = "settings";
  else if (segments[1] === "organizations")
    variant = segments[3] === "usage" ? "usage" : "settings";
  else if (segments[1] === "projects") {
    switch (segments[3]) {
      case "endpoints":
        variant = segments[4] && segments[4] !== "new" ? "endpoint" : "endpoints";
        break;
      case "deliveries":
        variant = segments[4] ? "delivery" : "deliveries";
        break;
      case "events":
        variant = segments[4] ? "event" : "events";
        break;
      case "api-keys":
        variant = "api-keys";
        break;
      case "settings":
        variant = "settings";
        break;
      case "usage":
        variant = "usage";
        break;
      case "receiver-guide":
        variant = "guide";
        break;
      default:
        variant = "overview";
    }
  }
  return <PageSkeleton variant={variant} />;
}

export function RouteContentLoading() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RouteSkeleton />
    </Suspense>
  );
}
