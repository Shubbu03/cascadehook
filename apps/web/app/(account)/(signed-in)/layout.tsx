import type { Metadata } from "next";
import { SignedInWorkspace } from "@/features/workspace/signed-in-workspace";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SignedInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SignedInWorkspace>{children}</SignedInWorkspace>;
}
