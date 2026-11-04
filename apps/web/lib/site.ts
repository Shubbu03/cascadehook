import type { Metadata } from "next";

// Canonical production origin. The docs Worker serves /docs on this same origin,
// so absolute URLs for both apps resolve here even in local development.
export const siteURL = "https://cascadehook.com";
export const siteName = "Cascadehook";

// Pages that set their own openGraph lose the inherited file-based image from
// app/opengraph-image.tsx, so they reference it directly.
const socialImage = { url: "/opengraph-image", width: 1200, height: 630, alt: "Cascadehook — Webhooks, taken care of." };

// Page titles are expanded by the root layout's template, but social cards don't
// use that template, so they get the full title spelled out.
export function pageMetadata({
  path,
  title,
  description,
  absoluteTitle = false,
}: {
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} · ${siteName}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName, url: path, title: fullTitle, description, images: socialImage },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: socialImage },
  };
}
