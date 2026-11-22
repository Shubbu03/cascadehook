// Shared with apps/web through the package's "./protocol" export, so it imports nothing.

export const subprotocol = "cascadehook.inbox.v1";

export const closeCodes = { gone: 4404, expired: 4410 } as const;

export type InboxLimits = { maxRequests: number; maxBodyBytes: number; ttlSeconds: number };

export type CreatedInbox = { inboxId: string; url: string; token: string; expiresAt: number; limits: InboxLimits };

export type CapturedRequest = {
  seq: number;
  receivedAt: number;
  method: string;
  path: string;
  query: string;
  headers: [string, string][];
  sourceIp: string | null;
  country: string | null;
  bodyBase64: string;
  bodySize: number;
  truncated: boolean;
};

export type InboxInfo = { id: string; url: string; createdAt: number; expiresAt: number } & InboxLimits;

export type ServerMessage =
  | { type: "ready"; inbox: InboxInfo; latestSeq: number }
  | { type: "request"; request: CapturedRequest }
  | { type: "deleted" }
  | { type: "expired" }
  | { type: "error"; code: "inbox_not_found" };

export type ErrorCode =
  | "not_found"
  | "inbox_not_found"
  | "origin_not_allowed"
  | "rate_limited"
  | "upgrade_required"
  | "method_not_allowed"
  | "body_too_large"
  | "internal_error";
