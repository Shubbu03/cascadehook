import type { Metadata } from "next";
import { webhookTesterContent } from "@/features/tools/content/webhook-tester";
import { WebhookTesterPage, webhookTesterMetadata } from "@/features/tools/webhook-tester/page";

export const metadata: Metadata = webhookTesterMetadata(webhookTesterContent);

export default function Page() {
  return <WebhookTesterPage content={webhookTesterContent} />;
}
