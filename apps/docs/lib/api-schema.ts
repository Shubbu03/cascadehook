import projectAPI from "@/openapi/project-api.json";

export function apiBaseURL() {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash
    ) return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function projectSchema() {
  return {
    ...projectAPI,
    servers: [{ url: apiBaseURL() ?? "https://YOUR_API_HOST" }],
  };
}
