// Same rule as fumadocs-core's isMarkdownPreferred, which the docs app uses,
// so both halves of the site negotiate identically.
const markdownTypes = new Set(["text/markdown", "text/x-markdown", "text/plain"]);
const htmlTypes = new Set(["text/html", "text/*", "*/*"]);

export function prefersMarkdown(accept: string | null) {
  if (!accept) return false;
  let markdown = 0;
  let html = 0;
  for (const range of accept.split(",")) {
    const [type = "", ...parameters] = range.split(";").map((part) => part.trim().toLowerCase());
    const q = parameters.find((parameter) => parameter.startsWith("q="));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    if (!(quality > 0)) continue;
    if (markdownTypes.has(type)) markdown = Math.max(markdown, quality);
    else if (htmlTypes.has(type)) html = Math.max(html, quality);
  }
  return markdown > 0 && markdown >= html;
}
