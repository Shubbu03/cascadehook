import { docsLlms } from "@/lib/llms";

export const dynamic = "force-static";

export function GET() {
  return new Response(docsLlms.index(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
