import type { FaqItem } from "@/components/marketing/faq-list";
import { cheapestPaidPlan, deliveryLimits, freePlan, monthlyDeliveries, monthlyPrice, pricingPath } from "./limits";

export const homeTitle = "Cascadehook — Outbound Webhook Delivery Service";

export const homeDescription =
  "Outbound webhook delivery for SaaS and API teams. Publish an event once; Cascadehook signs it, retries failures for 72 hours, and logs every attempt.";

export const homeFaq: FaqItem[] = [
  {
    question: "What is Cascadehook?",
    answer:
      "Cascadehook is an outbound webhook delivery service. Your application publishes an event with one API call, and Cascadehook signs it, delivers it to every subscribed endpoint, retries failures, and records every attempt.",
  },
  {
    question: "Who is it for?",
    answer:
      "SaaS and API teams that send webhooks to their customers or partners and would rather not build and run the queue, retries, signing, and delivery logs themselves.",
  },
  {
    question: "How is it different from building webhooks myself?",
    answer:
      "Sending one HTTP request is easy. Sending webhooks reliably also takes a durable queue, retries with backoff, request signing with secret rotation, protection against requests to private networks, and a log you can check when a customer asks what happened. Cascadehook provides all of that behind one API.",
    link: { href: "/compare", label: "Compare Cascadehook with Svix, Hookdeck, Convoy, and building it yourself" },
  },
  {
    question: "How much does it cost?",
    answer: `The free plan includes ${monthlyDeliveries(freePlan)} deliveries a month and needs no card. Paid plans start at ${monthlyPrice(cheapestPaidPlan)} a month for ${monthlyDeliveries(cheapestPaidPlan)} deliveries. Signing, retries, replay, and delivery history are included on every plan.`,
    link: { href: pricingPath, label: "See pricing" },
  },
  {
    question: "What happens when an endpoint is down?",
    answer: `Timeouts, network errors, and 408, 429, and 5xx responses are retried up to ${deliveryLimits.attempts} times over ${deliveryLimits.windowHours} hours with jittered backoff. If every attempt fails, the delivery is marked failed and you can replay it once the endpoint is back.`,
  },
  {
    question: "How do my customers verify a webhook?",
    answer:
      "Every request carries Standard Webhooks headers: Webhook-Id, Webhook-Timestamp, and Webhook-Signature, an HMAC-SHA256 signature over the raw body. Any Standard Webhooks library can verify it, and the receiver guides show how.",
    link: { href: "/tools/webhook-signature-verifier", label: "Try the signature verifier" },
  },
  {
    question: "Can Cascadehook receive webhooks from Stripe or GitHub?",
    answer:
      "No. Cascadehook sends webhooks from your application to your customers. To inspect webhooks you receive, use the free webhook tester.",
    link: { href: "/tools/webhook-tester", label: "Open the webhook tester" },
  },
];
