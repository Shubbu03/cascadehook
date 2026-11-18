import type { Metadata } from "next";
import { OrganizationUsageRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Organization usage" };

export default function Page() {
  return <OrganizationUsageRoute />;
}
