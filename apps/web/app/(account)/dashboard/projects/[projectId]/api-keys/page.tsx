import type { Metadata } from "next";
import { APIKeyList } from "@/features/api-keys/api-key-list";

export const metadata: Metadata = { title: "API keys" };
export default function Page() {
  return <APIKeyList />;
}
