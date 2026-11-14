import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { siteURL } from "@/lib/site";

type ElementProps = { children?: ReactNode; href?: string; path?: string };

function absolute(href: string) {
  return href.startsWith("/") ? siteURL + href : href;
}

function inline(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<ElementProps>(child)) return "";
    const text = inline(child.props.children);
    // DocsLink takes `path` instead of `href`.
    const href = child.props.href ?? child.props.path;
    if (child.type === "code") return "`" + text + "`";
    if (href) return `[${text}](${absolute(href)})`;
    if (child.type === "strong" || child.type === "b") return `**${text}**`;
    if (child.type === "em" || child.type === "i") return `*${text}*`;
    return text;
  }).join("");
}

function flat(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

// Converts the small set of prose elements used in page content (headings,
// paragraphs, lists, code, links) without rendering the React tree.
export function toMarkdown(node: ReactNode): string {
  const blocks: string[] = [];
  // Runs of text, code, and links between block elements form one paragraph.
  let paragraph: ReactNode[] = [];
  const flush = () => {
    const text = flat(inline(paragraph));
    if (text) blocks.push(text);
    paragraph = [];
  };
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child) || !blockTypes.has(child.type)) {
      paragraph.push(child);
      continue;
    }
    flush();
    const { children } = child.props;
    switch (child.type) {
      case Fragment:
        blocks.push(toMarkdown(children));
        break;
      case "h2":
      case "h3":
      case "h4":
        blocks.push("#".repeat(Number(child.type.slice(1))) + " " + flat(inline(children)));
        break;
      case "ul":
      case "ol": {
        const items = Children.toArray(children).filter(isValidElement<ElementProps>);
        blocks.push(items.map((item, index) => `${child.type === "ol" ? `${index + 1}.` : "-"} ${flat(inline(item.props.children))}`).join("\n"));
        break;
      }
      default:
        blocks.push(flat(inline(child)));
    }
  }
  flush();
  return blocks.filter(Boolean).join("\n\n");
}

const blockTypes = new Set<unknown>([Fragment, "h2", "h3", "h4", "p", "ul", "ol", "div"]);

export function markdownResponse(body: string, canonicalPath: string) {
  return new Response(body.trim() + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      // Folds the Markdown copy into the HTML page. Google advises against also
      // sending noindex on a duplicate; it conflicts with the canonical.
      Link: `<${siteURL}${canonicalPath}>; rel="canonical"`,
    },
  });
}
