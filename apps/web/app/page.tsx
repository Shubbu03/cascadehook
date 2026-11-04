import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { LandingPage } from "@/components/marketing/landing-page";
import { pageMetadata, siteName, siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";

const description =
  "Send events to your customers without building the delivery infrastructure. Signed webhooks, automatic retries, and a clear record of every attempt.";

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "Cascadehook — Webhooks, taken care of.",
  description,
  absoluteTitle: true,
});

const organizationID = siteURL + "/#organization";

// No ratings or reviews here: structured data must only describe what is true.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationID,
      name: siteName,
      url: siteURL,
      logo: siteURL + "/icon.svg",
      email: supportEmail,
      sameAs: ["https://github.com/Shubbu03/cascadehook"],
    },
    {
      "@type": "WebSite",
      "@id": siteURL + "/#website",
      name: siteName,
      url: siteURL,
      publisher: { "@id": organizationID },
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      url: siteURL,
      description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      // The terms state the service is currently available without a paid subscription.
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": organizationID },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <LandingPage />
    </>
  );
}
