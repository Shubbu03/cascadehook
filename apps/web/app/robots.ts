import type { MetadataRoute } from "next";
import { siteURL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in areas have nothing for crawlers; they already send noindex.
      disallow: ["/dashboard", "/account", "/onboarding", "/invitations"],
    },
    // The docs Worker owns /docs on this origin and publishes its own sitemap.
    sitemap: [siteURL + "/sitemap.xml", siteURL + "/docs/sitemap.xml"],
  };
}
