import type { Metadata } from "next";
import { DeliveryRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Delivery details" };

export default function Page() {
  return <DeliveryRoute />;
}
