export type Endpoint = {
  id: string;
  project_id: string;
  url: string;
  enabled: boolean;
  verified_at: string | null;
  has_signing_secret: boolean;
  event_types: string[];
  created_at: string;
  updated_at: string;
};

export type EndpointInput = { url: string; event_types: string[] };

export type SigningSecretReceipt = {
  endpoint_id: string;
  signing_secret: string;
  updated_at: string;
  previous_secret_expires_at: string | null;
};

export function endpointPath(projectId: string, endpointId?: string) {
  const collection =
    "/v1/projects/" + encodeURIComponent(projectId) + "/endpoints";
  return endpointId
    ? collection + "/" + encodeURIComponent(endpointId)
    : collection;
}

export const endpointKeys = {
  lists: (userId: string, projectId: string) =>
    ["endpoints", userId, projectId] as const,
  detail: (userId: string, projectId: string, endpointId: string) =>
    ["endpoint", userId, projectId, endpointId] as const,
};

export function endpointState(endpoint: Endpoint) {
  if (endpoint.enabled) return "Enabled";
  if (!endpoint.has_signing_secret) return "Needs signing secret";
  if (!endpoint.verified_at) return "Needs verification";
  return "Disabled";
}

export const eventTypePattern = /^[a-z0-9][a-z0-9_.-]{2,127}$/;
