import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { NextResponse, type NextRequest } from "next/server";

// Kept as middleware.ts rather than proxy.ts: OpenNext on Cloudflare needs Edge middleware.
const suffixed = rewritePath("/docs{/*path}.md", "/llms.mdx/docs{/*path}");
const negotiated = rewritePath("/docs{/*path}", "/llms.mdx/docs{/*path}");

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const target = suffixed.rewrite(pathname) || (isMarkdownPreferred(request) && negotiated.rewrite(pathname));
  const response = target ? NextResponse.rewrite(new URL(target, request.url)) : NextResponse.next();
  // The same URL serves HTML or Markdown depending on Accept.
  response.headers.append("Vary", "Accept");
  return response;
}

export const config = {
  matcher: [
    "/docs",
    "/docs.md",
    // Skips assets, metadata files, and /docs/agents.md, which has its own route.
    "/docs/((?!_next/|agents\\.md$|sitemap\\.xml$|opengraph-image).*)",
  ],
};
