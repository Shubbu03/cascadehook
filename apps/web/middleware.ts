import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { isAuthConfigured } from "@/lib/server/auth";

const clerkHandler = clerkMiddleware();

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!isAuthConfigured()) return NextResponse.next();
  return clerkHandler(request, event);
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
