import { createOpenAPI } from "fumadocs-openapi/server";
import type { Document } from "fumadocs-openapi";
import { projectSchema } from "./api-schema";

const schema = projectSchema();

// HEAD is supported wherever GET is documented. Keep it in the downloadable
// contract without duplicating every read operation in the navigation.
const paths = Object.fromEntries(
  Object.entries(schema.paths).map(([path, operations]) => [
    path,
    Object.fromEntries(Object.entries(operations).filter(([method]) => method !== "head")),
  ]),
);

export const openapi = createOpenAPI({
  input: { project: { ...schema, paths } as Document },
});
