import { PublicShell } from "@/components/marketing/public-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicShell showPricing>{children}</PublicShell>;
}
