import type { Metadata } from "next";
import { cheapestPaidPlan, monthlyPrice, pricingPath } from "@/features/marketing/limits";
import { Pricing } from "@/features/billing/pricing";
import { pageMetadata } from "@/lib/site";
export const metadata: Metadata = pageMetadata({ path: pricingPath, title: "Pricing", description: `Start free. Plans from ${monthlyPrice(cheapestPaidPlan)}/month with signing, automatic retries, and replay included.` });
export default function Page() { return <Pricing />; }
