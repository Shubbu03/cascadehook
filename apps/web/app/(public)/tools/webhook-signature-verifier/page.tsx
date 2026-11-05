import type { Metadata } from "next";
import { standardWebhooksContent } from "@/features/tools/content/standard-webhooks";
import { VerifierPage, verifierMetadata } from "@/features/tools/verifier-page";

export const metadata: Metadata = verifierMetadata(standardWebhooksContent);

export default function Page() {
  return <VerifierPage content={standardWebhooksContent} />;
}
