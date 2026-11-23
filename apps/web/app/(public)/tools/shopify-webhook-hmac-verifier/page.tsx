import type { Metadata } from "next";
import { shopifyContent } from "@/features/tools/content/shopify";
import { VerifierPage, verifierMetadata } from "@/features/tools/verifier-page";

export const metadata: Metadata = verifierMetadata(shopifyContent);

export default function Page() {
  return <VerifierPage content={shopifyContent} />;
}
