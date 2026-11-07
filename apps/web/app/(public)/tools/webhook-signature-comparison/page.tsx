import type { Metadata } from "next";
import { ComparisonPage, comparisonMetadata } from "@/features/tools/comparison-page";

export const metadata: Metadata = comparisonMetadata;

export default function Page() {
  return <ComparisonPage />;
}
