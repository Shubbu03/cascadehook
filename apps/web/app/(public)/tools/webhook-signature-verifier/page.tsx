import type { Metadata } from "next";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import { JsonLd } from "@/components/json-ld";
import { ReferenceTabs } from "@/features/tools/reference-tabs";
import { SignatureVerifier } from "@/features/tools/signature-verifier";
import { VerificationCode } from "@/features/tools/verification-code";
import { pageMetadata, siteName, siteURL } from "@/lib/site";

const path = "/tools/webhook-signature-verifier";
const description =
  "Free webhook signature verifier for Standard Webhooks (webhook-id, webhook-timestamp, webhook-signature). Paste a request to see if its HMAC-SHA256 signature is valid and why it fails. Runs entirely in your browser.";

export const metadata: Metadata = pageMetadata({
  path,
  title: "Webhook Signature Verifier",
  description,
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Webhook Signature Verifier",
  url: siteURL + path,
  description,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": siteURL + "/#organization", name: siteName },
};

const prose = "max-w-185 [&_h3]:text-[15px] [&_h3]:font-medium [&_h3:not(:first-child)]:mt-5 [&_p]:mt-1.5 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] [&_p:first-child]:mt-0 [&_ol]:mt-3 [&_ol]:pl-5.5 [&_ol]:[list-style:decimal] [&_ul]:mt-3 [&_ul]:pl-5.5 [&_ul]:[list-style:disc] [&_li]:mt-1.5 [&_li]:text-muted [&_li]:text-[14px] [&_li]:leading-[1.75] [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-foreground";

const failures = (
  <div className={prose}>
    <h3>The body was parsed before it was verified</h3>
    <p>
      The most common cause. Middleware such as <code>express.json()</code> turns the body into an object, and serializing it again changes key order, spacing, or number formatting.
      Verify the exact raw bytes first, then parse.
    </p>
    <h3>The secret is used as text</h3>
    <p>Passing the <code>whsec_…</code> string straight to your HMAC function uses its characters as the key. Strip the prefix and Base64-decode it first.</p>
    <h3>The wrong secret</h3>
    <p>Each endpoint has its own secret. After a rotation the old one stops working once the grace period ends, so make sure your receiver loads the new one.</p>
    <h3>The header is compared as a whole</h3>
    <p>The header can hold more than one signature. Split it on spaces and accept the request if any <code>v1</code> entry matches.</p>
    <h3>The timestamp is out of range</h3>
    <p>Clock drift, or testing with a request captured earlier, fails the tolerance check even when the signature is correct. Keep your clock synced with NTP.</p>
  </div>
);

const howItWorks = (
  <div className={prose}>
    <p>The sender signs every request with a secret shared with your endpoint and sends three headers:</p>
    <ul>
      <li><code>webhook-id</code>: a unique message ID. Retries keep it, so use it to skip duplicates.</li>
      <li><code>webhook-timestamp</code>: when the attempt was signed, in Unix seconds.</li>
      <li><code>webhook-signature</code>: one or more space-separated <code>v1,&lt;base64&gt;</code> signatures. There are two while the sender rotates its secret.</li>
    </ul>
    <p className="mt-4!">To verify a request:</p>
    <ol>
      <li>Remove the <code>whsec_</code> prefix and Base64-decode the rest. The decoded bytes are the HMAC key.</li>
      <li>Build the message <code>webhook-id + &quot;.&quot; + webhook-timestamp + &quot;.&quot; + raw body</code>.</li>
      <li>Compute HMAC-SHA256 of it and Base64-encode the result.</li>
      <li>Compare it in constant time with each <code>v1,</code> entry. Any match is valid.</li>
      <li>Reject timestamps more than five minutes from your clock.</li>
    </ol>
  </div>
);

export default function Page() {
  return (
    <div>
      <JsonLd data={structuredData} />
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="min-w-0">
          <p className="text-[13px] leading-[1.6]">
            <Link href="/tools" className="text-muted hover:text-foreground">Tools</Link>
            <span className="text-muted" aria-hidden="true"> / </span>
            <span className="text-accent">Free tool</span>
          </p>
          <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">Webhook signature verifier</h1>
        </div>
        <p className="max-w-120 text-muted text-[14px] leading-[1.7]">
          Check a <a className="underline underline-offset-[3px] hover:text-foreground" href="https://www.standardwebhooks.com/" target="_blank" rel="noopener noreferrer">Standard Webhooks</a> signature and see why it fails. Works with {siteName} and any sender that follows the spec.
        </p>
      </header>

      <section aria-label="Verifier" className="mt-8">
        <SignatureVerifier />
      </section>

      <section aria-label="Reference" className="mt-14">
        <ReferenceTabs
          label="Reference"
          tabs={[
            { id: "failures", label: "Why verification fails", content: failures },
            { id: "code", label: "Verification code", content: <VerificationCode /> },
            { id: "how", label: "How signatures work", content: howItWorks },
          ]}
        />
        <p className="mt-10 text-muted text-[13px] leading-[1.7]">
          Sending webhooks yourself? {siteName} signs every delivery this way, retries failures for up to 72 hours, and keeps every attempt for replay.
          {" "}<Link href="/login" className="text-foreground underline underline-offset-[3px]">Create a project</Link> or read the <DocsLink path="/docs/security/signatures" className="text-foreground underline underline-offset-[3px]">signature docs</DocsLink>.
        </p>
      </section>
    </div>
  );
}
