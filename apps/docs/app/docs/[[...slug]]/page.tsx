import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { OpenAPIPage } from "@/components/api-page";
import { JsonLd } from "@/components/json-ld";
import { markdownPath } from "@/lib/markdown";
import { siteName, siteURL } from "@/lib/site";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type Props = { params: Promise<{ slug?: string[] }> };
type Page = NonNullable<ReturnType<typeof source.getPage>>;

const updatedFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function DocumentationPage({ params }: Props) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const lastModified = page.type === "docs" ? page.data.lastModified : undefined;
  return (
    <DocsPage toc={page.data.toc} full={page.type === "openapi" || page.data.full}>
      <JsonLd data={structuredData(page.url, page.data.title, metaDescription(page), lastModified)} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {page.type === "openapi" ? (
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        ) : (
          <page.data.body components={getMDXComponents()} />
        )}
      </DocsBody>
      {lastModified && (
        <p className="mt-10 text-sm text-fd-muted-foreground">
          Last updated <time dateTime={lastModified.toISOString()}>{updatedFormat.format(lastModified)}</time>
        </p>
      )}
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const { title } = page.data;
  const description = metaDescription(page);
  // Social cards don't apply the layout's title template, so spell it out.
  const fullTitle = `${title} · Cascadehook Docs`;
  return {
    title,
    description,
    alternates: { canonical: page.url, types: { "text/markdown": markdownPath(page.url) } },
    openGraph: { type: "article", siteName, url: page.url, title: fullTitle, description, images: socialImage },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: socialImage },
  };
}

// Operation descriptions in the OpenAPI file are written for agents and start
// with scope rules, which make poor search snippets.
function metaDescription(page: Page) {
  if (page.type !== "openapi") return page.data.description;
  const operation = page.data.getOpenAPIPageProps().operations?.[0];
  if (!operation) return page.data.description;
  const method = operation.method.toUpperCase();
  const parts = ["GET", "DELETE"].includes(method) ? "Parameters, responses" : "Parameters, request body, responses";
  return `${page.data.title}: ${method} ${operation.path} in the Cascadehook project API. ${parts}, and the API key scope it requires.`;
}

// Setting openGraph here drops the inherited file-based image from
// app/docs/opengraph-image.tsx, so reference it directly.
const socialImage = {
  url: "/docs/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Cascadehook Docs — guides, receiver examples, and the API reference",
};

function structuredData(url: string, title: string | undefined, description: string | undefined, lastModified: Date | undefined) {
  // Folders without an index page have no URL, and every breadcrumb entry needs one.
  const trail = getBreadcrumbItems(url, source.getPageTree(), { includePage: true })
    .filter((item): item is { name: string; url: string } => typeof item.name === "string" && !!item.url && item.url !== "/docs");
  const crumbs = [{ name: "Docs", url: "/docs" }, ...trail];
  const graph: object[] = [
    {
      "@type": "TechArticle",
      headline: title,
      description,
      url: siteURL + url,
      dateModified: lastModified?.toISOString(),
      inLanguage: "en",
      // Site name markup belongs on the home page only, so reference it by ID.
      isPartOf: { "@id": siteURL + "/#website" },
      publisher: { "@type": "Organization", "@id": siteURL + "/#organization", name: siteName, url: siteURL },
    },
  ];
  if (crumbs.length > 1) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: siteURL + crumb.url,
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
