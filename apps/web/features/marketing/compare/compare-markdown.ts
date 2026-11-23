import { siteName, siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";
import {
  buildChecklist, choices, compareChecked, compareDisclosure, compareIntro, compareRows, compareSources, compareTitle, compareTrademark, options,
} from "./content";

export function compareMarkdown() {
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  const table = [
    `| | ${options.join(" | ")} |`,
    `|---|${options.map(() => "---").join("|")}|`,
    ...compareRows.map((row) => `| **${row.label}** | ${row.values.map(cell).join(" | ")} |`),
  ].join("\n");
  return [
    `# ${compareTitle}`,
    compareIntro,
    "## At a glance",
    table,
    `Checked against each product's documentation and pricing pages on ${compareChecked}.`,
    "## Which one fits",
    choices.map((choice) => `### Choose ${choice.name} if\n\n${choice.when}`).join("\n\n"),
    "## What building it yourself takes",
    "A first version is one HTTP request. A version your customers can rely on needs all of this:",
    buildChecklist.map((item) => `- ${item}`).join("\n"),
    `The [guide to sending webhooks from your app](${siteURL}/docs/guides/send-webhooks.md) walks through each piece.`,
    `## Try ${siteName}`,
    `[Create a project](${siteURL}/login) or read the [quickstart](${siteURL}/docs/quickstart.md). It's free during early access.`,
    "## Sources",
    compareSources.map((source) => `- [${source.label}](${source.href})`).join("\n"),
    `${compareDisclosure} If something is wrong or out of date, email ${supportEmail}.`,
    compareTrademark,
  ].join("\n\n");
}
