import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "Cascadehook — Webhooks, taken care of." },
  description:
    "Send events to your customers without building the delivery infrastructure. Signed webhooks, automatic retries, and a clear record of every attempt.",
};

export default function HomePage() {
  return <LandingPage />;
}
