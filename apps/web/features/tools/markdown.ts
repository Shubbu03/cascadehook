import { toMarkdown } from "@/lib/markdown";
import { siteName, siteURL } from "@/lib/site";
import { references, tools } from "./catalog";
import type { VerifierContent } from "./verifier-page";

const fence: Record<string, string> = { node: "js", python: "python", go: "go" };

export function verifierMarkdown(content: VerifierContent) {
  const snippets = content.snippets.map((snippet) =>
    [`### ${snippet.label}`, snippet.note, "```" + (fence[snippet.id] ?? "") + "\n" + snippet.code + "\n```"].join("\n\n"),
  );
  return [
    `# ${content.title}`,
    toMarkdown(content.intro),
    `The interactive verifier is at ${siteURL}${content.path}. It runs in the browser, so nothing pasted into it is sent anywhere.`,
    "## Why verification fails",
    toMarkdown(content.failures),
    "## Verification code",
    snippets.join("\n\n"),
    "## How signatures work",
    toMarkdown(content.howItWorks),
    "## Related",
    `- [Webhook signature schemes compared](${siteURL}/tools/webhook-signature-comparison.md)`
      + `\n- [All webhook tools](${siteURL}/tools.md)`
      + `\n- [${siteName}](${siteURL}/index.md) sends webhooks signed with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay.`,
    content.trademark
      ? `${content.trademark.name} is a trademark of ${content.trademark.owner.replace(/\.$/, "")}. ${siteName} isn't affiliated with or endorsed by ${content.trademark.name}.`
      : "",
  ].filter(Boolean).join("\n\n");
}

export function toolsIndexMarkdown() {
  return [
    "# Webhook tools",
    "Free utilities for debugging webhooks. No sign-up, and nothing you paste leaves your browser.",
    "## Signature verifiers",
    tools.map((tool) => `- [${tool.title}](${siteURL}${tool.href}.md): ${tool.description}`).join("\n"),
    "## Reference",
    references.map((reference) => `- [${reference.title}](${siteURL}${reference.href}.md): ${reference.description}`).join("\n"),
  ].join("\n\n");
}
