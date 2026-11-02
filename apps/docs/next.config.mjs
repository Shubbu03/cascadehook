import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // The dashboard owns /_next; keep docs assets inside its /docs route.
  assetPrefix: "/docs",
  experimental: {
    turbopackPluginRuntimeStrategy: "workerThreads",
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
