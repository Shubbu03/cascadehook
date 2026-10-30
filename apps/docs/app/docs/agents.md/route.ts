import { source } from "@/lib/source";

export const dynamic = "force-static";

export async function GET() {
  const page = source.getPage(["agents", "integration"]);
  if (!page || page.type !== "docs") return new Response("Not found", { status: 404 });
  return new Response(await page.data.getText("raw"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
