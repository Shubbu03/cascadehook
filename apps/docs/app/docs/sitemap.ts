import type { MetadataRoute } from "next";
import { siteURL } from "@/lib/site";
import { source } from "@/lib/source";

// Lives under app/docs so it is served at /docs/sitemap.xml, inside the routes
// this Worker owns on the main domain.
export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: siteURL + page.url,
    priority: page.type === "openapi" ? 0.5 : 0.8,
  }));
}
