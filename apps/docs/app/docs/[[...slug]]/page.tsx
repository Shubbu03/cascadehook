import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle, docMetadata } from "@/lib/docs-page";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type Props = { params: Promise<{ slug?: string[] }> };

// API operation pages are served by app/docs/api/[group]/[operation].
function guidePage(slug: string[] | undefined) {
  const page = source.getPage(slug);
  return page?.type === "docs" ? page : undefined;
}

export default async function GuidePage({ params }: Props) {
  const page = guidePage((await params).slug);
  if (!page) notFound();
  return (
    <DocArticle page={page}>
      <page.data.body components={getMDXComponents()} />
    </DocArticle>
  );
}

export function generateStaticParams() {
  return source.generateParams().filter((params) => guidePage(params.slug));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = guidePage((await params).slug);
  if (!page) notFound();
  return docMetadata(page);
}
