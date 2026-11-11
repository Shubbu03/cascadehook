import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { supportEmail } from "@/lib/support";
import { prose } from "@/components/styles";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy policy",
  description: "How Cascadehook processes account, endpoint, event, and delivery data while delivering webhooks.",
});

export default function Page() {
  return (
    <article className={prose}>
      <h1>Privacy policy</h1>
      <p>Effective November 2, 2026. This policy describes how Cascadehook, independently operated from India, processes information while providing webhook delivery.</p>
      <h2>Information we process</h2>
      <ul>
        <li>Account identifiers, authentication information supplied by Clerk, organization memberships, and profile details needed for account and invitation features.</li>
        <li>Endpoint URLs, subscriptions to event types, event payloads, delivery and attempt metadata, and configuration you supply.</li>
        <li>API-key hashes and display prefixes, encrypted endpoint signing secrets, and encrypted invitation email payloads. API keys are disclosed once when created.</li>
        <li>Support conversations, invitation email addresses, email delivery status, and operational logs needed to operate and protect the service.</li>
      </ul>
      <h2>How information is used</h2>
      <p>We use this information to authenticate users, enforce organization access, deliver events to the endpoints you configure, send transactional messages, answer support requests, prevent abuse, and diagnose failures.</p>
      <p>You control the event payloads and receiver destinations. Avoid publishing data you do not have permission to share. Receivers independently control the data delivered to them.</p>
      <h2>Service providers</h2>
      <p>Clerk processes authentication and identity; Resend processes transactional and support email. Our hosting and database providers process application data to run the service. These providers may process data outside India under their own service terms and privacy policies.</p>
      <h2>Retention and deletion</h2>
      <p>Event payloads and delivery history are removed by scheduled retention cleanup. Active deliveries and recent replay work can delay cleanup. Aggregate usage and operational records can remain after event payloads are removed. Notification history is normally retained for 90 days.</p>
      <p>Account and organization deletion request background cleanup. Provider records and backups may persist under their retention policies. Email us for questions about support-message retention or deletion.</p>
      <h2>Browser storage</h2>
      <p>Authentication uses Clerk-managed session mechanisms. Cascadehook also stores preferences such as theme choice. Application code does not save project API keys or signing secrets in browser storage.</p>
      <h2>Your choices and contact</h2>
      <p>You can manage resources and request account deletion in the dashboard. Contact <a href={"mailto:" + supportEmail}>{supportEmail}</a> for access, correction, or deletion requests, or questions about this policy. We may verify your identity before acting on a request.</p>
      <h2>Policy updates</h2>
      <p>We will publish updates here and provide notice of material changes through the service or an appropriate contact channel.</p>
    </article>
  );
}
