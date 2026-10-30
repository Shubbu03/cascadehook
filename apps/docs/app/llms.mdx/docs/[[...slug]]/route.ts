import { docsLlms } from "@/lib/llms";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = source.getPage((await params).slug);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(await docsLlms.page(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
