import type { VerifierContent } from "../verifier-page";
import { githubContent } from "./github";
import { shopifyContent } from "./shopify";
import { slackContent } from "./slack";
import { standardWebhooksContent } from "./standard-webhooks";
import { stripeContent } from "./stripe";

export const verifierContents: VerifierContent[] = [
  standardWebhooksContent,
  stripeContent,
  githubContent,
  shopifyContent,
  slackContent,
];
