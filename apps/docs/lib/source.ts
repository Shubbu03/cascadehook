import { loader } from "fumadocs-core/source";
import { docs } from "@/.source/server";
import { openapi } from "./openapi";

function slugify(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({
      baseDir: "api",
      per: "operation",
      groupBy: "tag",
      meta: false,
      slugify,
      name(entry) {
        const id = entry.type === "operation"
          ? this.fromExtractedOperation(entry.item)?.operation.operationId
          : entry.item.name;
        if (!id) throw new Error("Every documented API operation must have an operationId.");
        return slugify(id);
      },
    }),
  },
  { baseUrl: "/docs", plugins: [openapi.loaderPlugin()] },
);
