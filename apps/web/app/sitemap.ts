import type { MetadataRoute } from "next";
import { siteURL } from "@/lib/site";

// Documentation pages are listed in /docs/sitemap.xml, served by the docs app.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteURL, priority: 1 },
    { url: siteURL + "/support", priority: 0.5 },
    { url: siteURL + "/terms", priority: 0.2 },
    { url: siteURL + "/privacy", priority: 0.2 },
  ];
}
