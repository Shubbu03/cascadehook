import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { OpenAPIPage } from "@/components/api-page";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type Props = { params: Promise<{ slug?: string[] }> };

export default async function DocumentationPage({ params }: Props) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return (
    <DocsPage toc={page.data.toc} full={page.type === "openapi" || page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        {page.type === "openapi" ? (
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        ) : (
          <page.data.body components={getMDXComponents()} />
        )}
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
