import { ProjectRoute } from "@/features/workspace/routes";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProjectRoute>{children}</ProjectRoute>;
}
