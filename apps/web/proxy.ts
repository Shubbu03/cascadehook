import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { isAuthConfigured } from "@/lib/server/auth";

const clerkProxy = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isAuthConfigured()) return NextResponse.next();
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
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
