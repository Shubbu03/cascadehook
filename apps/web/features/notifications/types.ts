export const notificationCategories = {
  delivery: "Delivery",
  credentials: "Credentials",
  usage: "Usage",
  team: "Team",
  access: "Access",
  project: "Project",
} as const;

export type NotificationCategory = keyof typeof notificationCategories;
export type NotificationState = "all" | "unread" | "read" | "archived";
export type NotificationFilters = {
  projectId?: string;
  category?: NotificationCategory;
  state: NotificationState;
};

export type InboxNotification = {
  id: string;
  organization_id: string;
  project_id: string | null;
  type: string;
  category: NotificationCategory;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  target: { type: string; id: string | null };
  actor_user_id: string | null;
  occurrence_count: number;
  resolved_at: string | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
};

export function notificationInboxHref(organizationId: string) {
  return "/dashboard/organizations/" + encodeURIComponent(organizationId) + "/notifications";
}

export function notificationTarget(item: InboxNotification) {
  // Deleted resources keep their notification, but the API removes their target.
  const organization = "/dashboard/organizations/" + encodeURIComponent(item.organization_id);
  const project = item.project_id
    ? "/dashboard/projects/" + encodeURIComponent(item.project_id)
    : null;
  switch (item.target.type) {
    case "members":
      return organization + "/settings";
    case "project":
      return project;
    case "api_key":
      return project && item.target.id ? project + "/api-keys" : null;
    case "endpoint":
      return project && item.target.id ? project + "/endpoints/" + encodeURIComponent(item.target.id) : null;
    case "usage":
      return (project ?? organization) + "/usage";
    default:
      return null;
  }
}
