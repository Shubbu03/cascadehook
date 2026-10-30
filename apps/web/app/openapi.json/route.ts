import { redirectToDocumentation } from "@/lib/server/docs-redirect";

export function GET(request: Request) {
  return redirectToDocumentation(request);
}
