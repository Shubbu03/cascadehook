import "server-only";
import { cache } from "react";
import { apiRequest } from "@/lib/api";
import { requireSession } from "@/lib/server/session";
import { resolveSetup } from "./setup-state";

export const getWorkspaceSetup = cache(async () => {
  const { getToken } = await requireSession();
  return resolveSetup(
    <T>(path: string, params?: Record<string, string | number>) =>
      apiRequest<T>(path, getToken, { params }),
  );
});
