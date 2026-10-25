import { apiRequest, ApiError } from "@/lib/api";
import { uuidPattern } from "@/lib/format";
import type { Project } from "@/features/workspace/types";
import { endpointPath, type Endpoint } from "./types";

export async function requestEndpointDeletion(
  project: Project,
  endpoint: Endpoint,
  getToken: () => Promise<string | null>,
) {
  if (project.role !== "owner" && project.role !== "admin")
    throw new ApiError("Only an owner or admin can delete this endpoint.", 403);
  if (
    !uuidPattern.test(project.id) ||
    !uuidPattern.test(endpoint.id) ||
    endpoint.project_id !== project.id
  )
    throw new Error(
      "The endpoint does not belong to this project. Refresh before deleting.",
    );
  await apiRequest<void>(endpointPath(project.id, endpoint.id), getToken, {
    method: "DELETE",
  });
}
