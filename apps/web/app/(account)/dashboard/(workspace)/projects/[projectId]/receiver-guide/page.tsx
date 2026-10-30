import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { docsHref } from "@/lib/docs";

export const metadata: Metadata = { title: "Receiver guide" };
export default function ReceiverGuidePage() {
  redirect(docsHref("/docs/security/verification"));
}
