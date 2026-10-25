import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function receiverSource(
  file: "receiver-core.mjs" | "node-receiver.mjs" | "bun-receiver.mjs",
) {
  "use cache";
  return readFile(join(process.cwd(), "public", "examples", file), "utf8");
}
