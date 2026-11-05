import type { MetadataRoute } from "next";
import { siteURL } from "@/lib/site";

// Documentation pages are listed in /docs/sitemap.xml, served by the docs app.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteURL, priority: 1 },
    { url: siteURL + "/tools", priority: 0.6 },
    { url: siteURL + "/tools/webhook-signature-verifier", priority: 0.8 },
    { url: siteURL + "/tools/stripe-webhook-signature-verifier", priority: 0.8 },
    { url: siteURL + "/tools/github-webhook-signature-verifier", priority: 0.8 },
    { url: siteURL + "/tools/shopify-webhook-hmac-verifier", priority: 0.8 },
    { url: siteURL + "/tools/slack-request-signature-verifier", priority: 0.8 },
    { url: siteURL + "/support", priority: 0.5 },
    { url: siteURL + "/terms", priority: 0.2 },
    { url: siteURL + "/privacy", priority: 0.2 },
  ];
}
