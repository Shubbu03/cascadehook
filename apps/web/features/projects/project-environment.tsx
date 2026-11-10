import type { Project } from "@/features/workspace/types";

export function ProjectEnvironment({ environment }: { environment: Project["environment"] }) {
  if (!environment) return null;
  return <span className="inline-flex rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted capitalize">{environment}</span>;
}
