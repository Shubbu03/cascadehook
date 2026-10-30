import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { PublishExample } from "@/components/publish-example";
import { ReceiverSource } from "@/components/receiver-source";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, PublishExample, ReceiverSource, ...components };
}
