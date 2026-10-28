import { eventTypePattern } from "@/features/endpoints/types";
import type { Project } from "@/features/workspace/types";
import { apiRequest, ApiError } from "@/lib/api";
import { uuidPattern } from "@/lib/format";
import { projectPath } from "./types";

export const MAX_EVENT_BYTES = 256 * 1024;
export type Publication = Readonly<{
  type: string;
  body: string;
  idempotencyKey: string;
}>;
export type PublicationReceipt = {
  id: string;
  type: string;
  created_at: string;
  delivery_count: number;
};
export type PublicationField = "type" | "payload" | "idempotencyKey";
export type PublicationErrors = Partial<Record<PublicationField, string>>;

export class PublicationError extends Error {
  constructor(public readonly errors: PublicationErrors) {
    super(
      Object.values(errors)[0] ?? "Check the event fields before publishing.",
    );
    this.name = "PublicationError";
  }
}

export function preparePublication(
  type: string,
  payload: string,
  idempotencyKey: string,
  eventTypes?: readonly string[],
): Publication {
  type = type.trim();
  const errors: PublicationErrors = {};
  if (!eventTypePattern.test(type))
    errors.type =
      "Use 3–128 lowercase letters, numbers, dots, underscores, or hyphens.";
  else if (eventTypes && !eventTypes.includes(type))
    errors.type = "Choose an event type subscribed to by the setup endpoint.";
  if (!/^[\x21-\x7e]{1,255}$/.test(idempotencyKey))
    errors.idempotencyKey =
      "Use 1–255 visible ASCII characters without spaces.";
  // Validate without reserializing: preserve JSON numbers and the exact payload bytes.
  try {
    JSON.parse(payload);
  } catch {
    errors.payload = 'Enter valid JSON, such as {"order_id": "ord_001"}.';
  }
  const body = '{"type":' + JSON.stringify(type) + ',"data":' + payload + "}";
  if (new TextEncoder().encode(body).length > MAX_EVENT_BYTES)
    errors.payload = "The complete event must be no larger than 256 KiB.";
  if (Object.keys(errors).length) throw new PublicationError(errors);
  return Object.freeze({ type, body, idempotencyKey });
}

export async function publishEvent(
  project: Pick<Project, "id" | "role">,
  publication: Publication,
  getToken: () => Promise<string | null>,
  signal?: AbortSignal,
): Promise<PublicationReceipt> {
  if (project.role !== "owner" && project.role !== "admin")
    throw new ApiError("Only an owner or admin can publish events.", 403);
  if (!uuidPattern.test(project.id))
    throw new Error(
      "The project could not be confirmed. Reload before publishing.",
    );
  const result = await apiRequest<unknown>(
    projectPath(project.id, "events"),
    getToken,
    {
      method: "POST",
      data: publication.body,
      idempotencyKey: publication.idempotencyKey,
      signal,
    },
  );
  if (!result || typeof result !== "object") throw invalidReceipt();
  const receipt = result as Record<string, unknown>;
  if (
    typeof receipt.id !== "string" ||
    !uuidPattern.test(receipt.id) ||
    receipt.type !== publication.type ||
    typeof receipt.created_at !== "string" ||
    !Number.isFinite(Date.parse(receipt.created_at)) ||
    typeof receipt.delivery_count !== "number" ||
    !Number.isSafeInteger(receipt.delivery_count) ||
    receipt.delivery_count < 0
  )
    throw invalidReceipt();
  return receipt as PublicationReceipt;
}

function invalidReceipt() {
  return new Error(
    "The acceptance response could not be confirmed. Retry the same request to check whether it was accepted.",
  );
}
