import type { Metadata } from "next";
import { EndpointList } from "@/features/endpoints/endpoint-list";

export const metadata: Metadata = { title: "Endpoints" };
export default function EndpointsPage() {
  return <EndpointList />;
}
