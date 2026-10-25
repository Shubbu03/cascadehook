import type { OrganizationRole } from "@/features/workspace/types";

export type Usage = {
  organization_id: string;
  project_id?: string;
  period: string;
  resets_at: string;
  usage: {
    events: number;
    deliveries: number;
    accepted_payload_bytes: number;
    attempts_started: number;
    replays: number;
    successful_attempts: number;
    unsuccessful_attempts: number;
  };
  limits: {
    projects: number;
    members: number;
    endpoints_per_project: number;
    active_api_keys_per_project: number;
    monthly_events: number;
    monthly_deliveries: number;
    payload_bytes_per_project: number;
  };
  stored_payload_bytes: number;
  projects: number;
  members: number;
  endpoints: number;
  active_api_keys: number;
};
export type Membership = {
  user_id: string;
  organization_id: string;
  role: OrganizationRole;
  created_at: string;
  updated_at: string;
  profile?: { name: string; email?: string };
};
export type Invitation = {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
export type InvitationReceipt = {
  invitation: Invitation;
  token: string;
  accept_url?: string;
};

export function invitationStatus(invitation: Invitation, now = Date.now()) {
  if (invitation.accepted_at) return "Accepted";
  if (invitation.revoked_at) return "Revoked";
  return Date.parse(invitation.expires_at) <= now ? "Expired" : "Pending";
}
