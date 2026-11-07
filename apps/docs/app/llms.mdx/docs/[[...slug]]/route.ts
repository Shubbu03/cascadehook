import { docsLlms } from "@/lib/llms";
import { markdownResponse } from "@/lib/markdown";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  return markdownResponse(await docsLlms.page(page), page.url);
}

export function generateStaticParams() {
  return source.generateParams();
}
