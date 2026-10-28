import type { Metadata } from "next";
import { EndpointList } from "@/features/endpoints/endpoint-list";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Endpoints" };
export default function EndpointsPage() {
  return <EndpointList />;
}
