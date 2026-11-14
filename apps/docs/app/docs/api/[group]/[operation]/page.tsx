import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpenAPIPage } from "@/components/api-page";
import { DocArticle, docMetadata } from "@/lib/docs-page";
import { source } from "@/lib/source";

type Props = { params: Promise<{ group: string; operation: string }> };

function operationPage({ group, operation }: { group: string; operation: string }) {
  const page = source.getPage(["api", group, operation]);
  return page?.type === "openapi" ? page : undefined;
}

export default async function OperationPage({ params }: Props) {
  const page = operationPage(await params);
  if (!page) notFound();
  return (
    <DocArticle page={page}>
      <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
    </DocArticle>
  );
}

export function generateStaticParams() {
  return source.getPages()
    .filter((page) => page.type === "openapi")
    .map((page) => ({ group: page.slugs[1], operation: page.slugs[2] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = operationPage(await params);
  if (!page) notFound();
  return docMetadata(page);
}
