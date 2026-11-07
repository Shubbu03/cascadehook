import { toolsIndexMarkdown } from "@/features/tools/markdown";
import { markdownResponse } from "@/lib/markdown";

export function GET() {
  return markdownResponse(toolsIndexMarkdown(), "/tools");
}
