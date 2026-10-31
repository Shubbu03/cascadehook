import type { NextConfig } from "next";
import { documentationBaseURL } from "./lib/docs";

const nextConfig: NextConfig = {
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
