import { eventTypePattern, type EndpointInput } from "./types";

export type EndpointDraft = { url: string; eventTypes: string };
export type EndpointErrors = { url?: string; eventTypes?: string };

export function validateEndpointDraft(draft: EndpointDraft):
  | { valid: true; input: EndpointInput }
  | { valid: false; errors: EndpointErrors } {
  const url = draft.url.trim();
  const errors: EndpointErrors = {};
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      url.includes("#") ||
      new TextEncoder().encode(url).length > 2048
    )
      errors.url =
        "Use a public HTTPS URL without credentials or a fragment, up to 2,048 bytes.";
  } catch {
    errors.url = "Enter a valid HTTPS destination URL.";
  }
  const eventTypes = draft.eventTypes
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    !eventTypes.length ||
    eventTypes.length > 100 ||
    eventTypes.some((item) => !eventTypePattern.test(item))
  )
    errors.eventTypes =
      "Enter 1–100 event types, each 3–128 characters, using lowercase letters, numbers, dots, underscores, or hyphens.";
  else if (new Set(eventTypes).size !== eventTypes.length)
    errors.eventTypes = "Remove duplicate event types.";
  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, input: { url, event_types: eventTypes } };
}
