import type { Metadata } from "next";
import { ProjectUsage } from "@/features/settings/usage";

export const metadata: Metadata = { title: "Usage" };
export default function Page() {
  return <ProjectUsage />;
}
