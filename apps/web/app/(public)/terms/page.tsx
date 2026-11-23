import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import { supportEmail } from "@/lib/support";
import { prose } from "@/components/styles";

export const metadata: Metadata = pageMetadata({
  path: "/terms",
  title: "Terms of use",
  description: "The terms that govern use of Cascadehook, an independently operated webhook delivery service.",
});

export default function Page() {
  return (
    <article className={prose}>
      <h1>Terms of use</h1>
      <p>Effective November 2, 2026. These terms govern your use of Cascadehook, an independently operated webhook delivery service based in India. Contact <a href={"mailto:" + supportEmail}>{supportEmail}</a> with questions.</p>
      <h2>Your account and content</h2>
      <p>You are responsible for your account, organization members, API keys, receiver endpoints, and the data you publish. Only send data you are authorized to process and deliver. Keep credentials secure and notify us if you suspect unauthorized access.</p>
      <h2>Permitted use</h2>
      <p>Use Cascadehook for lawful application events. Do not send spam, malware, stolen credentials, or unlawful content; attack receivers or the service; bypass quotas; or use multiple accounts to evade limits. We may restrict abusive activity to protect other users and receivers.</p>
      <h2>Service access and limits</h2>
      <p>Cascadehook is currently available without a paid subscription. Usage and resource limits protect the service; your organization’s dashboard shows the allowances that apply. Accepted deliveries and automatic retries can continue after new publications are blocked by a limit.</p>
      <p>We may change the service or its limits as the product develops. Any future paid offering will disclose its pricing and terms before purchase.</p>
      <h2>Delivery and availability</h2>
      <p>Webhook acceptance and receiver delivery are different outcomes. Delivery uses bounded retries and can produce duplicates. Receivers must verify signatures and handle repeated deliveries safely. History and payloads are subject to scheduled retention cleanup. Keep your own copy of information you need long term.</p>
      <p>We maintain the service with reasonable care, but do not currently offer an uptime SLA, guaranteed delivery time, or 24/7 support. Internet failures, receiver failures, maintenance, and third-party outages can affect availability. To the extent permitted by applicable law, the service is provided without additional warranties; nothing here excludes rights or liability that cannot legally be excluded.</p>
      <h2>Privacy and closing your account</h2>
      <p>Our <Link href="/privacy">privacy policy</Link> explains how data is used. You can request account or organization deletion in the dashboard, subject to ownership and membership requirements. Deletion initiates background cleanup and is not an instant erasure of provider records or backups. We may suspend access for misuse or material breaches of these terms.</p>
    </article>
  );
}
