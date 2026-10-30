import { NextResponse } from "next/server";
import { documentationBaseURL } from "@/lib/docs";

export function redirectToDocumentation(request: Request) {
  if (!documentationBaseURL) {
    return NextResponse.json(
      { error: "docs_not_configured", message: "Documentation is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const source = new URL(request.url);
  const destination = new URL(source.pathname + source.search, documentationBaseURL);
  if (destination.origin === source.origin) {
    return NextResponse.json(
      { error: "docs_not_configured", message: "Documentation is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(destination, 307);
}
