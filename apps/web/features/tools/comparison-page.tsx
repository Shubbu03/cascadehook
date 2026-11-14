import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, pageMetadata, siteName, siteURL } from "@/lib/site";
import { references } from "./catalog";
import { comparisonChecked, comparisonNotes, comparisonPath, comparisonRows, comparisonSummary } from "./comparison";

const reference = references.find((item) => item.href === comparisonPath)!;

export const comparisonMetadata: Metadata = pageMetadata({
  path: comparisonPath,
  title: "Webhook Signature Schemes Compared",
  description: reference.description,
  markdown: true,
});

const table = "w-full min-w-240 border-collapse text-left text-[13px] leading-[1.65] [&_th]:border-b [&_th]:border-solid [&_th]:border-border [&_th]:py-2.5 [&_th]:pr-5 [&_th]:align-bottom [&_th]:font-medium [&_th]:text-muted [&_td]:border-b [&_td]:border-solid [&_td]:border-border [&_td]:py-3 [&_td]:pr-5 [&_td]:align-top [&_td]:text-muted [&_tbody_th]:text-foreground [&_tbody_th]:align-top [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-foreground";
const textLink = "text-foreground underline underline-offset-[3px]";

export function ComparisonPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: reference.title,
        description: reference.description,
        url: siteURL + comparisonPath,
        dateModified: reference.updated,
        inLanguage: "en",
        publisher: { "@type": "Organization", "@id": siteURL + "/#organization", name: siteName, url: siteURL },
      },
      breadcrumbList([{ name: "Tools", path: "/tools" }, { name: reference.title, path: comparisonPath }]),
    ],
  };

  return (
    <div>
      <JsonLd data={structuredData} />
      <header className="max-w-185">
        <p className="text-[13px] leading-[1.6]">
          <Link href="/tools" className="text-muted hover:text-foreground">Tools</Link>
          <span className="text-muted" aria-hidden="true"> / </span>
          <span className="text-accent">Reference</span>
        </p>
        <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">{reference.title}</h1>
        <p className="mt-3 text-muted text-[15px] leading-[1.8]">{comparisonSummary}</p>
      </header>

      <section aria-labelledby="signing-heading" className="mt-10">
        <h2 id="signing-heading" className="text-[19px] font-medium tracking-[-.015em]">How each request is signed</h2>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="signing-heading">
          <table className={table}>
            <thead>
              <tr><th scope="col">Scheme</th><th scope="col">Headers</th><th scope="col">Signed message</th><th scope="col">Encoding</th><th scope="col">Key</th><th scope="col">Timestamp tolerance</th></tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className="font-medium">
                    {row.verifier && row.name !== siteName ? <Link href={row.verifier} className={textLink}>{row.name}</Link> : row.name}
                  </th>
                  <td>{row.headers.map((header, index) => <span key={header}>{index > 0 && ", "}<code>{header}</code></span>)}</td>
                  <td><code>{row.message}</code></td>
                  <td>{row.encoding}</td>
                  <td>{row.key}</td>
                  <td>{row.tolerance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="delivery-heading" className="mt-12">
        <h2 id="delivery-heading" className="text-[19px] font-medium tracking-[-.015em]">Retries and response deadlines</h2>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="delivery-heading">
          <table className={table}>
            <thead>
              <tr><th scope="col">Sender</th><th scope="col">Automatic retries</th><th scope="col">Response deadline</th><th scope="col">Source</th></tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className="font-medium">{row.name}</th>
                  <td>{row.retries}</td>
                  <td>{row.deadline}</td>
                  <td><a href={row.source.href} className={textLink} target="_blank" rel="noopener noreferrer">{row.source.label}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-muted text-[12px] leading-[1.6]">Checked against each provider&apos;s documentation on {comparisonChecked}.</p>
      </section>

      <section aria-labelledby="notes-heading" className="mt-12 max-w-185">
        <h2 id="notes-heading" className="text-[19px] font-medium tracking-[-.015em]">What the differences mean</h2>
        <ul className="mt-3 pl-5.5 [list-style:disc] [&_li]:mt-1.5 [&_li]:text-muted [&_li]:text-[14px] [&_li]:leading-[1.75]">
          {comparisonNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>

      <p className="mt-10 text-muted text-[13px] leading-[1.7]">
        Debugging a mismatch? Each scheme has a free verifier that shows which input is wrong; start from the <Link href="/tools" className={textLink}>webhook tools</Link>.
      </p>
    </div>
  );
}
