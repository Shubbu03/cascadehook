export type OrganizationRole = "owner" | "admin" | "member";

export type Account = {
  id: string;
  created_at: string;
  onboarding_completed_at: string | null;
};

export type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  role: OrganizationRole;
  created_at: string;
  updated_at: string;
};

export type Page<T> = { data: T[]; next_cursor: string | null };
