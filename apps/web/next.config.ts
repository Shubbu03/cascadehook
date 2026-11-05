import type { NextConfig } from "next";
import { documentationBaseURL } from "./lib/docs";

const isDev = process.env.NODE_ENV === "development";

function originOf(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

// A Clerk publishable key is `pk_(test|live)_` + base64("<frontend API host>$").
// Deriving the host keeps dev (*.clerk.accounts.dev) and prod
// (clerk.cascadehook.com) instances correct without a second env var.
function clerkFrontendOrigin() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const encoded = key?.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  if (!encoded) return undefined;
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : undefined;
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
const clerkOrigin = clerkFrontendOrigin();
// Clerk's bot protection renders a Cloudflare Turnstile challenge on sign-up.
const turnstileOrigin = "https://challenges.cloudflare.com";

// No nonces: cacheComponents prerenders static shells, which cannot carry a
// per-request nonce, so inline scripts need 'unsafe-inline'.
const contentSecurityPolicy = [
  "default-src 'self'",
  ["script-src 'self' 'unsafe-inline'", isDev && "'unsafe-eval'", clerkOrigin, turnstileOrigin],
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com",
  "font-src 'self'",
  ["connect-src 'self'", apiOrigin, clerkOrigin, isDev && "ws:"],
  `frame-src ${turnstileOrigin}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((directive) => (Array.isArray(directive) ? directive.filter(Boolean).join(" ") : directive))
  .join("; ");

const securityHeaders = [
  // Covers subdomains too (api., clerk.); all of them are HTTPS-only.
  // Add `preload` only once we are sure no subdomain will ever need plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Report-only until the browser console shows no violations on the landing
  // page, sign-in/sign-up, and dashboard; then rename to Content-Security-Policy.
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  // Enforced clickjacking guard while the CSP (and its frame-ancestors) is report-only.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    const accountRedirects = [
      { source: "/sign-in/:path*", destination: "/login#/:path*", permanent: false },
      { source: "/sign-up/:path*", destination: "/login#/create/:path*", permanent: false },
    ];
    if (!documentationBaseURL) return accountRedirects;
    const docsRedirects = [
      "/docs/:path*",
      "/openapi.json",
      "/llms.txt",
      "/llms-full.txt",
      "/examples/receiver-core.mjs",
      "/examples/node-receiver.mjs",
      "/examples/bun-receiver.mjs",
    ].map((source) => ({
      source,
      destination: documentationBaseURL + source,
      permanent: false,
    }));
    return [...accountRedirects, ...docsRedirects];
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
