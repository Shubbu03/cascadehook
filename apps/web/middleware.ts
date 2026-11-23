import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { prefersMarkdown } from "@/lib/negotiation";
import { isAuthConfigured } from "@/lib/server/auth";

const clerkHandler = clerkMiddleware();

// Public pages with a Markdown copy under app/md.
function markdownTarget(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/index.md") return "/md";
  if (pathname === "/tools.md" || (pathname.startsWith("/tools/") && pathname.endsWith(".md"))) {
    return "/md" + pathname.slice(0, -".md".length);
  }
  if (!prefersMarkdown(request.headers.get("accept"))) return undefined;
  if (pathname === "/") return "/md";
  if (pathname === "/tools" || pathname.startsWith("/tools/")) return "/md" + pathname;
  return undefined;
}

function isMarkdownCapable(pathname: string) {
  return pathname === "/" || pathname === "/tools" || pathname.startsWith("/tools/") || pathname === "/index.md" || pathname === "/tools.md";
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isMarkdownCapable(request.nextUrl.pathname)) {
    const target = markdownTarget(request);
    const response = target ? NextResponse.rewrite(new URL(target, request.url)) : NextResponse.next();
    // The same URL serves HTML or Markdown depending on Accept.
    response.headers.append("Vary", "Accept");
    return response;
  }
  if (!isAuthConfigured()) return NextResponse.next();
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/",
    "/index.md",
    "/tools",
    "/tools.md",
    "/tools/:path*",
    "/login(.*)",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/onboarding(.*)",
    "/invitations/accept(.*)",
    "/dashboard(.*)",
    "/account(.*)",
    "/__clerk/(.*)",
  ],
};
