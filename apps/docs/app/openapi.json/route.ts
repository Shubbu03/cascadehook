import { apiBaseURL, projectSchema } from "@/lib/api-schema";

export function GET() {
  if (!apiBaseURL()) {
    return Response.json(
      { error: "api_not_configured", message: "The API origin is not configured for this documentation deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(projectSchema());
}
