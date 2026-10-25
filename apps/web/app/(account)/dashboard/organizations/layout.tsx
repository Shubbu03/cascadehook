import { AccountWorkspace } from "@/features/workspace/account-workspace";
export default function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountWorkspace>{children}</AccountWorkspace>;
}
