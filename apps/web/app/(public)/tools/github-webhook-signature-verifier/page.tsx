import type { Metadata } from "next";
import { githubContent } from "@/features/tools/content/github";
import { VerifierPage, verifierMetadata } from "@/features/tools/verifier-page";

export const metadata: Metadata = verifierMetadata(githubContent);

export default function Page() {
  return <VerifierPage content={githubContent} />;
}
