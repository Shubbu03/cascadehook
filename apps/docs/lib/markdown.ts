import { siteURL } from "./site";

// /docs/agents.md is the published agent integration guide, so the agents
// overview page keeps its Markdown at the internal route instead.
export function markdownPath(url: string) {
  return url === "/docs/agents" ? "/llms.mdx/docs/agents" : url + ".md";
}

// The canonical header folds the Markdown copy into the HTML page. Google
// advises against adding noindex to duplicates; it conflicts with the canonical.
export function markdownResponse(body: string, canonicalPath: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${siteURL}${canonicalPath}>; rel="canonical"`,
    },
  });
}
