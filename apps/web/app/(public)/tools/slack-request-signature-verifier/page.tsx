import type { Metadata } from "next";
import { slackContent } from "@/features/tools/content/slack";
import { VerifierPage, verifierMetadata } from "@/features/tools/verifier-page";

export const metadata: Metadata = verifierMetadata(slackContent);

export default function Page() {
  return <VerifierPage content={slackContent} />;
}
