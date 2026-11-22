import type { InboxLimits } from "./protocol";

export const ttlMs = 24 * 60 * 60 * 1000;
export const maxRequests = 50;
export const maxBodyBytes = 256 * 1024;

export const limits: InboxLimits = { maxRequests, maxBodyBytes, ttlSeconds: ttlMs / 1000 };
