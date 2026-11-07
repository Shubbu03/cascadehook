import type { MetadataRoute } from "next";
import { references, tools, toolsIndexUpdated } from "@/features/tools/catalog";
import { siteURL } from "@/lib/site";

// Bump these when the page's content changes.
const pages = [
  { path: "", updated: "2026-11-05", priority: 1 },
  { path: "/support", updated: "2026-11-04", priority: 0.5 },
  { path: "/terms", updated: "2026-11-04", priority: 0.2 },
  { path: "/privacy", updated: "2026-11-04", priority: 0.2 },
];

// Documentation pages are listed in /docs/sitemap.xml, served by the docs app.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...pages.map((page) => ({ url: siteURL + page.path, lastModified: page.updated, priority: page.priority })),
    { url: siteURL + "/tools", lastModified: toolsIndexUpdated, priority: 0.6 },
    ...tools.map((tool) => ({ url: siteURL + tool.href, lastModified: tool.updated, priority: 0.8 })),
    ...references.map((reference) => ({ url: siteURL + reference.href, lastModified: reference.updated, priority: 0.7 })),
  ];
}
