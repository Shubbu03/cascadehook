import { llms } from "fumadocs-core/source";
import { markdownPath } from "./markdown";
import { siteURL } from "./site";
import { source } from "./source";

export const docsLlms = llms(source, {
  renderPage: async (page) => {
    if (page.type === "openapi") {
      const { operations } = page.data.getOpenAPIPageProps();
      const schema = page.data.getSchema().bundled;
      const paths = Object.fromEntries(
        (operations ?? []).map(({ path, method }) => [path, {
          [method]: schema.paths?.[path]?.[method],
        }]),
      );
      return "```json\n" + JSON.stringify({ ...schema, paths }, null, 2) + "\n```";
    }
    return page.data.getText("processed");
  },
});

// /llms.txt is served by this Worker for the whole origin, so it also lists the
// web app's Markdown pages. Those paths are owned by apps/web (app/md).
const header = `# Cascadehook

> Cascadehook is a hosted service for sending webhooks from your application. You publish an event with one API call; Cascadehook signs it with Standard Webhooks headers, delivers it to every subscribed HTTPS endpoint, retries failures, and records each attempt for inspection and replay.

Every link below is a Markdown page. Any docs page also returns Markdown when you append \`.md\` to its URL or request it with \`Accept: text/markdown\`.

## Product

- [Cascadehook overview](${siteURL}/index.md): What Cascadehook does, how delivery and retries work, its limits, and how to start.
- [Free webhook tools](${siteURL}/tools.md): Browser-based signature verifiers for Standard Webhooks, Stripe, GitHub, Shopify, and Slack.
- [Webhook signature schemes compared](${siteURL}/tools/webhook-signature-comparison.md): Headers, signed message, key handling, timestamp tolerance, and retry policy for each provider.

## Documentation
`;

const footer = `
## Optional

- [Complete documentation](${siteURL}/llms-full.txt): Every docs page and the API reference in one file.
- [OpenAPI schema](${siteURL}/openapi.json): The project API as OpenAPI JSON.
`;

export async function llmsIndex() {
  const tree = await docsLlms.index();
  // Fumadocs links each page to its HTML URL; agents want the Markdown copy.
  const body = tree
    .replace(/^# .*\n+/, "")
    .replace(/\]\((\/docs[^)\s]*)\)/g, (_match, url: string) => `](${siteURL}${markdownPath(url)})`);
  return header + "\n" + body.trim() + "\n" + footer;
}
