import { deliveryLimits, retryDelaysSeconds } from "./limits";

// One example event followed through the whole landing page, so every chapter shows the same delivery.
export const storyEvent = {
  id: "01a20d26-0c18-7bd9-8b74-a88a4e527e00",
  type: "invoice.paid",
  idempotencyKey: "invoice-inv_1024-paid",
  body: '{"type":"invoice.paid","data":{"invoice_id":"inv_1024"}}',
  publishedAt: "10:42:07",
};

export type StoryEndpoint = { url: string; owner: string; status: number; label: string; duration: number };

// The first endpoint is the one the hero card and chapters 03 to 05 follow.
export const storyEndpoints: StoryEndpoint[] = [
  { url: "api.yourapp.com/webhooks/billing", owner: "Your billing service", status: 503, label: "Unavailable", duration: 120 },
  { url: "hooks.acme-crm.com/cascadehook", owner: "A customer's CRM", status: 200, label: "OK", duration: 142 },
  { url: "ledger.partner.io/v2/inbound", owner: "A partner's ledger", status: 200, label: "OK", duration: 96 },
];

export const storyDelivery = {
  id: "01a20d26-0c40-7fbd-9bef-7877aa487575",
  path: "/webhooks/billing",
  timestamp: 1795516927,
  signature: "v1,Ofw6uszCI5uqNQG/j/jcRVyGXpeqq+wdod2VWOx8EDk=",
};

// Waits sit inside the default ±20% jitter around 15s and 60s.
export const storyAttempts = [
  { at: "10:42:07", status: 503, label: "Unavailable", duration: 120, next: "Retry in 16s" },
  { at: "10:42:23", status: 503, label: "Unavailable", duration: 98, next: "Retry in 61s" },
  { at: "10:43:24", status: 200, label: "OK", duration: 84, next: "Delivered" },
];

function shortDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = seconds / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

const horizonSeconds = deliveryLimits.windowHours * 3600;
const logPosition = (seconds: number) => Math.log10(1 + seconds / retryDelaysSeconds[0]) / Math.log10(1 + horizonSeconds / retryDelaysSeconds[0]);

// Attempt offsets from the first try, placed on a log scale so seconds and hours share one line.
export const retrySchedule = [0, ...retryDelaysSeconds].map((_, index, all) => {
  const offset = all.slice(1, index + 1).reduce((sum, delay) => sum + delay, 0);
  return {
    attempt: index + 1,
    offset,
    label: index === 0 ? "now" : `+${shortDuration(offset)}`,
    wait: index === 0 ? null : shortDuration(all[index]),
    position: logPosition(offset),
  };
});

export const retryHorizonLabel = `${deliveryLimits.windowHours}h`;

export const hiddenSteps = [
  "Every endpoint answered a signed challenge before it could be enabled.",
  "Requests went only to public IP addresses, and redirects were never followed.",
  "Each request had a timeout, and at most 4 KiB of each response was read.",
  "Each attempt was recorded before it was sent, so a worker crash would show up in the log instead of vanishing.",
  "The signing secret stayed encrypted at rest with AES-GCM.",
];

const clockSeconds = (time: string) => time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
const delivered = storyAttempts[storyAttempts.length - 1];

// Totals for the receipt at the end of the story, derived from the example above.
export const tripTotals = {
  events: 1,
  deliveries: storyEndpoints.length,
  attempts: storyAttempts.length + storyEndpoints.length - 1,
  seconds: clockSeconds(delivered.at) - clockSeconds(storyEvent.publishedAt),
};

export const tripSteps = [
  { at: storyEvent.publishedAt, chapter: "01", href: "#how-it-works", text: "Published once, with an Idempotency-Key" },
  { at: storyEvent.publishedAt, chapter: "02", href: "#fan-out", text: `Fanned out to ${storyEndpoints.length} endpoints, each tracked on its own` },
  { at: storyEvent.publishedAt, chapter: "03", href: "#signing", text: "Signed with Standard Webhooks headers" },
  { at: storyAttempts[1].at, chapter: "04", href: "#retries", text: `Retried through ${storyAttempts.length - 1} failed attempts` },
  { at: delivered.at, chapter: "05", href: "#replay", text: "Delivered and recorded, ready to replay" },
];
