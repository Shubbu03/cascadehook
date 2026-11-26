import { redirect } from "next/navigation";
import { billingHref } from "@/lib/plans";

// Organization usage now lives on the combined usage and billing page.
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  redirect(billingHref(organizationId));
}
