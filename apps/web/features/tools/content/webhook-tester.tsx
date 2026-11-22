import type { ReactNode } from "react";

export type WebhookTesterContent = {
  path: string;
  title: string;
  metaTitle: string;
  description: string;
  intro: ReactNode;
  guide: ReactNode;
  signatures: ReactNode;
  limits: ReactNode;
  faq: { question: string; answer: string }[];
};

export const webhookTesterContent: WebhookTesterContent = {
  path: "/tools/webhook-tester",
  title: "Webhook tester",
  metaTitle: "Webhook Tester: Free Webhook Site and Request Catcher",
  description: "Free webhook tester: get a URL, inspect requests live, and verify Stripe, GitHub, Shopify, and Slack signatures. Secrets stay in your browser.",
  intro: (
    <>
      A free request catcher for testing webhooks. You get a URL instantly, with no sign-up. Every request sent to it appears here live, and signatures from Stripe, GitHub, Shopify, Slack, and Standard Webhooks senders are checked as they arrive.
    </>
  ),
  guide: (
    <>
      <h3>How to test a webhook</h3>
      <ol>
        <li>Copy the URL above. It&apos;s yours for 24 hours.</li>
        <li>Paste it into the provider&apos;s webhook settings as the endpoint, or point your own app at it.</li>
        <li>Trigger an event, such as a test payment, a push to a repository, or a slash command. Or send one yourself with <code>curl</code>.</li>
        <li>Open the request to see its method, path, query, headers, and the exact body bytes, with JSON formatted for reading.</li>
      </ol>
      <h3>What a webhook test shows you</h3>
      <p>
        Capturing a real delivery answers the questions that documentation leaves open: which headers the sender adds, whether the body is JSON or form-encoded, how timestamps are formatted, and what an event payload really contains. Every inbox answers with <code>200 OK</code>, so senders treat each delivery as received and don&apos;t retry.
      </p>
    </>
  ),
  signatures: (
    <>
      <p>
        Most webhook testers show you a signature header and stop there. This one recognizes <code>Stripe-Signature</code>, <code>X-Hub-Signature-256</code>, <code>X-Shopify-Hmac-Sha256</code>, <code>X-Slack-Signature</code>, and Standard Webhooks headers, including <code>svix-signature</code>. Paste the signing secret and every request from that sender is checked.
      </p>
      <p>
        The check runs in your browser with Web Crypto. The secret is never sent to the inbox or anywhere else, and it isn&apos;t saved. Because the body is the exact bytes that arrived, a mismatch rules out the most common cause, a re-encoded body. What&apos;s left is usually the wrong secret, such as one from a different endpoint or from test mode.
      </p>
      <p>
        A valid signature here and a rejection in your own code means the bug is in your code&apos;s handling: it parses the body before verifying, reads the wrong header, or compares strings in different encodings. The provider verifiers walk through each of those.
      </p>
    </>
  ),
  limits: (
    <>
      <ul>
        <li>Each URL and everything sent to it is deleted 24 hours after it&apos;s created. You can delete it sooner with the Delete button.</li>
        <li>The newest 50 requests are kept. Bodies larger than 256 KB are cut off and answered with 413.</li>
        <li>Only this browser can see the requests. It holds a private viewing key, created with the URL and never part of it. Anyone who knows the URL can send to it, though.</li>
        <li>The inbox runs on its own infrastructure, separate from Cascadehook&apos;s webhook delivery service, and it never logs request contents.</li>
        <li>It&apos;s meant for test data. Don&apos;t send production payloads, real customer data, or live credentials.</li>
      </ul>
    </>
  ),
  faq: [
    {
      question: "Is this webhook site free?",
      answer: "Yes. There's no sign-up and no paid tier. Each URL lasts 24 hours, and you can create a new one at any time.",
    },
    {
      question: "Which HTTP methods and paths are captured?",
      answer: "Every method, including GET, POST, PUT, PATCH, DELETE, and OPTIONS preflights. Anything after the inbox ID in the path is captured too, so a URL like /your-id/stripe/events works.",
    },
    {
      question: "Can I test webhooks sent to localhost?",
      answer: "The tester gives you a public URL, so providers can reach it without a tunnel. It doesn't forward requests to your machine yet. To replay a captured request locally, copy its body and headers into curl.",
    },
    {
      question: "Why does a valid signature show a timestamp warning?",
      answer: "Senders sign each delivery with the time it was sent, and receivers usually reject anything older than about five minutes to stop replays. A request captured earlier is still correctly signed, just too old to accept.",
    },
    {
      question: "Who can see the requests sent to my URL?",
      answer: "Only the browser that created the URL. It holds a private viewing key that's never part of the URL. Requests and the URL are deleted after 24 hours.",
    },
  ],
};
