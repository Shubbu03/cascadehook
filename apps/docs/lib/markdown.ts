import { siteURL } from "./site";

// /docs/agents.md is the published agent integration guide, so the agents
// overview page keeps its Markdown at the internal route instead.
export function markdownPath(url: string) {
  return url === "/docs/agents" ? "/llms.mdx/docs/agents" : url + ".md";
}

// Markdown copies stay out of search results and point back at the HTML page.
export function markdownResponse(body: string, canonicalPath: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex",
      Link: `<${siteURL}${canonicalPath}>; rel="canonical"`,
    },
  });
}
