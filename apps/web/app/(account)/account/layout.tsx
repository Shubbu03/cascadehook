import type { Metadata } from "next";
import { AccountWorkspace } from "@/features/workspace/account-workspace";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountWorkspace>{children}</AccountWorkspace>;
}
