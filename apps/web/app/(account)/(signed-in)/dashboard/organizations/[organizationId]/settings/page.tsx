import type { Metadata } from "next";
import { OrganizationSettingsRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Organization settings" };

export default function Page() {
  return <OrganizationSettingsRoute />;
}
