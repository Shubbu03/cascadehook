import { SetupGate } from "@/features/workspace/setup-gate";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SetupGate>{children}</SetupGate>;
}
