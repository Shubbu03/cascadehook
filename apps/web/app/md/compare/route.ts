import { compareMarkdown } from "@/features/marketing/compare/compare-markdown";
import { comparePath } from "@/features/marketing/compare/content";
import { markdownResponse } from "@/lib/markdown";

export function GET() {
  return markdownResponse(compareMarkdown(), comparePath);
}
