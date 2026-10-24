import type { Metadata } from "next";
import { ReceiverGuide } from "@/features/endpoints/receiver-guide";

export const metadata: Metadata = { title: "Receiver guide" };
export default function ReceiverGuidePage() {
  return <ReceiverGuide />;
}
