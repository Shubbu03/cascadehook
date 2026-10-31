import type { ComponentProps } from "react";
import { docsHref } from "@/lib/docs";

type DocsLinkProps = Omit<ComponentProps<"a">, "href" | "target" | "rel"> & {
  path?: string;
};

export function DocsLink({ path = "/docs", ...props }: DocsLinkProps) {
  return <a {...props} href={docsHref(path)} target="_blank" rel="noopener noreferrer" />;
}
