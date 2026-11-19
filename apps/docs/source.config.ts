import { execFileSync } from "node:child_process";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// A shallow clone dates every file to the head commit, which would publish the
// same lastmod for every page on each deploy. Omit dates rather than guess.
function hasFullGitHistory() {
  try {
    return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "false";
  } catch {
    return false;
  }
}

export const docs = defineDocs({
  dir: "content/docs",
  docs: { lastModified: hasFullGitHistory(), postprocess: { includeProcessedMarkdown: true } },
});

export default defineConfig();
