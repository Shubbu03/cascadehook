import type { Metadata } from "next";
import { EndpointRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Endpoint settings" };

export default function Page() {
  return <EndpointRoute />;
}
