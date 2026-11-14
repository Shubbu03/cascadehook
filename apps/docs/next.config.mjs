import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const isDev = process.env.NODE_ENV === "development";

function originOf(value) {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

// The OpenAPI playground sends requests to the API from the browser.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
// Cloudflare injects its Web Analytics beacon at the edge; it loads from one
// host and reports to another.
const cloudflareBeaconOrigin = "https://static.cloudflareinsights.com";
const cloudflareInsightsOrigin = "https://cloudflareinsights.com";

// Docs share cascadehook.com with the dashboard but run as a separate worker,
// so they need their own copy of the dashboard's headers (minus Clerk).
const contentSecurityPolicy = [
  "default-src 'self'",
  ["script-src 'self' 'unsafe-inline'", isDev && "'unsafe-eval'", cloudflareBeaconOrigin],
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  ["connect-src 'self'", apiOrigin, cloudflareInsightsOrigin, isDev && "ws:"],
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((directive) => (Array.isArray(directive) ? directive.filter(Boolean).join(" ") : directive))
  .join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The dashboard owns /_next; keep docs assets inside its /docs route.
  assetPrefix: "/docs",
  experimental: {
    turbopackPluginRuntimeStrategy: "workerThreads",
    // Inline the stylesheet so it doesn't block first paint.
    inlineCss: true,
    // Keep simultaneous prerender workers bounded for the HTML and Markdown routes.
    cpus: 2,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withMDX(config);
