import type { NextConfig } from "next";
import { documentationBaseURL } from "./lib/docs";

const nextConfig: NextConfig = {
  async redirects() {
    if (!documentationBaseURL) return [];
    return [
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
