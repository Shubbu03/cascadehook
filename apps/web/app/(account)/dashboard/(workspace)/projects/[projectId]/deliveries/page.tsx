import type { Metadata } from "next";
import { DeliveryList } from "@/features/activity/delivery-list";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Deliveries" };
export default function Page() {
  return <DeliveryList />;
}
