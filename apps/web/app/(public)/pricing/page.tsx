import type { Metadata } from "next";
import { Pricing } from "@/features/billing/pricing";
export const metadata: Metadata = { title: "Pricing", description: "Start free. Plans from $9/month with signing, automatic retries, and replay included." };
export default function Page() { return <Pricing />; }
