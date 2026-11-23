import type { Metadata } from "next";
import { stripeContent } from "@/features/tools/content/stripe";
import { VerifierPage, verifierMetadata } from "@/features/tools/verifier-page";

export const metadata: Metadata = verifierMetadata(stripeContent);

export default function Page() {
  return <VerifierPage content={stripeContent} />;
}
