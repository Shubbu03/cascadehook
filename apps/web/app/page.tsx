import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { faqStructuredData } from "@/components/marketing/faq-list";
import { LandingPage } from "@/components/marketing/landing-page";
import { homeDescription, homeFaq, homeTitle } from "@/features/marketing/home-content";
import { pageMetadata, siteName, siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";


export const metadata: Metadata = pageMetadata({
  path: "/",
  title: homeTitle,
  description: homeDescription,
  absoluteTitle: true,
  markdown: true,
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
      // Google's logo guidelines ask for a raster image of at least 112px.
      logo: siteURL + "/icon1.png",
      email: supportEmail,
      sameAs: ["https://github.com/Shubbu03/cascadehook"],
    },
    {
      "@type": "WebSite",
      "@id": siteURL + "/#website",
      name: siteName,
      // Google's fallback when it doesn't pick `name` as the site name.
      alternateName: ["cascadehook.com"],
      url: siteURL,
      publisher: { "@id": organizationID },
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      url: siteURL,
      description: homeDescription,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      // The terms state the service is currently available without a paid subscription.
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": organizationID },
    },
    faqStructuredData(homeFaq),
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
