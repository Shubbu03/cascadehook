import type { Metadata } from "next";
import { ReceiverGuide } from "@/features/endpoints/receiver-guide";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Receiver guide" };
export default function ReceiverGuidePage() {
  return <ReceiverGuide />;
}
