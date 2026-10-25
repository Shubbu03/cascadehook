import type { Metadata } from "next";
import { DeliveryList } from "@/features/activity/delivery-list";

export const metadata: Metadata = { title: "Deliveries" };
export default function Page() {
  return <DeliveryList />;
}
