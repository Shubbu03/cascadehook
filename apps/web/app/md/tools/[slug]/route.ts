import { comparisonMarkdown, comparisonPath } from "@/features/tools/comparison";
import { verifierContents } from "@/features/tools/content";
import { verifierMarkdown } from "@/features/tools/markdown";
import { markdownResponse } from "@/lib/markdown";

const pages = new Map<string, () => string>([
  ...verifierContents.map((content) => [content.path, () => verifierMarkdown(content)] as const),
  [comparisonPath, comparisonMarkdown],
]);

export function generateStaticParams() {
  return [...pages.keys()].map((path) => ({ slug: path.slice("/tools/".length) }));
}

export async function GET(_request: Request, { params }: RouteContext<"/md/tools/[slug]">) {
  const path = "/tools/" + (await params).slug;
  const render = pages.get(path);
  if (!render) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  return markdownResponse(render(), path);
}
