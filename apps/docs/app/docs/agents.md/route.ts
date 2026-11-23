import { markdownResponse } from "@/lib/markdown";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export async function GET() {
  const page = source.getPage(["agents", "integration"]);
  if (!page || page.type !== "docs") return new Response("Not found", { status: 404 });
  return markdownResponse(await page.data.getText("raw"), page.url);
}
