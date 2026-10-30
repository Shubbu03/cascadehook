import { integrationAPIBaseURL } from "@/features/agent-setup/prompt";
import projectAPI from "@/features/docs/project-api.openapi.json";

export function GET() {
  const apiBaseURL = integrationAPIBaseURL(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!apiBaseURL) {
    return Response.json(
      { error: "api_not_configured", message: "The platform operator must configure the API origin before using this schema." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json({ ...projectAPI, servers: [{ url: apiBaseURL }] });
}
