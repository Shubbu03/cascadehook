import type { Metadata } from "next";
import { AccountSettings } from "@/features/settings/account-settings";
// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Account settings" };
export default function AccountPage() {
  return <AccountSettings />;
}
