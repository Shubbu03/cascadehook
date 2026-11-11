// Keys read or invalidated from more than one feature. A key used in a single
// file stays next to its query.
export const queryKeys = {
  organizations: (userId: string) => ["organizations", userId] as const,
  organization: (userId: string, organizationId?: string) =>
    ["organization", userId, organizationId] as const,
  projects: (userId: string, organizationId?: string) =>
    ["projects", userId, organizationId] as const,
  // Prefix of every project detail key for this user.
  projectDetails: (userId: string) => ["project", userId] as const,
  project: (userId: string, projectId?: string) =>
    ["project", userId, projectId] as const,
  projectStatus: (userId: string, projectId: string) =>
    ["project-status", userId, projectId] as const,
  projectUsage: (userId: string, projectId: string) =>
    ["usage", userId, "project", projectId] as const,
  organizationUsage: (userId: string, organizationId: string) =>
    ["usage", userId, "organization", organizationId] as const,
  events: (userId: string, projectId: string) =>
    ["events", userId, projectId] as const,
  deliveries: (userId: string, projectId: string) =>
    ["deliveries", userId, projectId] as const,
};
