import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
  // Read from git at build time; without git history the date is left out.
  docs: { lastModified: true, postprocess: { includeProcessedMarkdown: true } },
});

export default defineConfig();
