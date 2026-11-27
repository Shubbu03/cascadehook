import type { Metadata } from "next";
import { OrganizationBillingRoute } from "@/features/workspace/routes";

export const instant = false;
export const metadata: Metadata = { title: "Usage & billing" };

export default function Page() {
  return <OrganizationBillingRoute />;
}
