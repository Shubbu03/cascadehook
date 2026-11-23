import type { Adapter, ProviderId } from "../core";
import { github } from "./github";
import { shopify } from "./shopify";
import { slack } from "./slack";
import { standardWebhooks } from "./standard-webhooks";
import { stripe } from "./stripe";

// Looked up client-side because server pages can't pass functions as props.
export const adapters: Record<ProviderId, Adapter> = {
  "standard-webhooks": standardWebhooks,
  stripe,
  github,
  shopify,
  slack,
};
