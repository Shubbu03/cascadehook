import { toMarkdown } from "@/lib/markdown";
import { siteName, siteURL } from "@/lib/site";
import { references, tools } from "./catalog";
import type { WebhookTesterContent } from "./content/webhook-tester";
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
      + `\n- [${siteName}](${siteURL}/index.md) sends webhooks signed with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay.`
      + `\n- [How Cascadehook compares](${siteURL}/compare.md) with Svix, Hookdeck Outpost, Convoy, and building it yourself.`,
    content.trademark
      ? `${content.trademark.name} is a trademark of ${content.trademark.owner.replace(/\.$/, "")}. ${siteName} isn't affiliated with or endorsed by ${content.trademark.name}.`
      : "",
  ].filter(Boolean).join("\n\n");
}

export function toolsIndexMarkdown() {
  return [
    "# Webhook tools",
    "Free utilities for debugging webhooks. No sign-up, and signature checks run in the browser, so pasted secrets never leave it.",
    "## Tools",
    tools.map((tool) => `- [${tool.title}](${siteURL}${tool.href}.md): ${tool.description}`).join("\n"),
    "## Reference",
    references.map((reference) => `- [${reference.title}](${siteURL}${reference.href}.md): ${reference.description}`).join("\n"),
    "## Sending webhooks from your own app?",
    `[${siteName}](${siteURL}/index.md) signs every delivery with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay. There's a free plan, and no card is required. See [how it compares](${siteURL}/compare.md) with Svix, Hookdeck Outpost, Convoy, and building it yourself.`,
  ].join("\n\n");
}

export function webhookTesterMarkdown(content: WebhookTesterContent) {
  return [
    `# ${content.title}`,
    toMarkdown(content.intro),
    `The interactive tester is at ${siteURL}${content.path}. Opening it creates a temporary URL on in.cascadehook.com that captures any request for 24 hours.`,
    "## Guide",
    toMarkdown(content.guide),
    "## Signature checks",
    toMarkdown(content.signatures),
    "## Limits and privacy",
    toMarkdown(content.limits),
    "## FAQ",
    content.faq.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n"),
    "## Related",
    tools.filter((tool) => tool.href !== content.path).map((tool) => `- [${tool.title}](${siteURL}${tool.href}.md)`).join("\n")
      + `\n- [${siteName}](${siteURL}/index.md) sends webhooks signed with Standard Webhooks, retries failures for up to 72 hours, and keeps every attempt for replay.`
      + `\n- [How Cascadehook compares](${siteURL}/compare.md) with Svix, Hookdeck Outpost, Convoy, and building it yourself.`,
  ].join("\n\n");
}
