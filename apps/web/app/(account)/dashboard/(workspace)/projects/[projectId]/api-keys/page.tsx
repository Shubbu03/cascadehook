import type { Metadata } from "next";
import { APIKeyList } from "@/features/api-keys/api-key-list";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "API keys" };
export default function Page() {
  return <APIKeyList />;
}
