import { homeMarkdown } from "@/features/marketing/home-markdown";
import { markdownResponse } from "@/lib/markdown";

export function GET() {
  return markdownResponse(homeMarkdown(), "/");
}
