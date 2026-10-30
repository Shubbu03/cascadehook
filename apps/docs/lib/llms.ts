import { llms } from "fumadocs-core/source";
import { source } from "./source";

export const docsLlms = llms(source, {
  renderPage: async (page) => {
    if (page.type === "openapi") {
      const { operations } = page.data.getOpenAPIPageProps();
      const schema = page.data.getSchema().bundled;
      const paths = Object.fromEntries(
        (operations ?? []).map(({ path, method }) => [path, {
          [method]: schema.paths?.[path]?.[method],
        }]),
      );
      return "```json\n" + JSON.stringify({ ...schema, paths }, null, 2) + "\n```";
    }
    return page.data.getText("processed");
  },
});
