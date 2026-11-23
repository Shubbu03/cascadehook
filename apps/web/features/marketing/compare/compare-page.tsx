import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import { JsonLd } from "@/components/json-ld";
import { comparisonTable } from "@/features/tools/comparison-page";
import { breadcrumbList, pageMetadata, siteName, siteURL } from "@/lib/site";
import { supportEmail } from "@/lib/support";
import {
  buildChecklist, choices, compareChecked, compareDescription, compareDisclosure, compareIntro, compareMetaTitle, comparePath,
  compareRows, compareSources, compareTitle, compareTrademark, compareUpdated, options,
} from "./content";

export const compareMetadata: Metadata = pageMetadata({
  path: comparePath,
  title: compareMetaTitle,
  description: compareDescription,
  absoluteTitle: true,
  markdown: true,
});

const textLink = "text-foreground underline underline-offset-[3px]";
const heading = "text-[19px] font-medium tracking-[-.015em]";

export function ComparePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: compareTitle,
        description: compareDescription,
        url: siteURL + comparePath,
        dateModified: compareUpdated,
        inLanguage: "en",
        publisher: { "@type": "Organization", "@id": siteURL + "/#organization", name: siteName, url: siteURL },
      },
      breadcrumbList([{ name: "Compare", path: comparePath }]),
    ],
  };

  return (
    <div>
      <JsonLd data={structuredData} />
      <header className="max-w-185">
        <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Compare</p>
        <h1 className="mt-2 text-[clamp(30px,3.6vw,42px)] font-medium leading-[1.15] tracking-[-.04em]">{compareTitle}</h1>
        <p className="mt-3 text-muted text-[15px] leading-[1.8]">{compareIntro}</p>
      </header>

      <section aria-labelledby="table-heading" className="mt-10">
        <h2 id="table-heading" className={heading}>At a glance</h2>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="table-heading">
          <table className={comparisonTable}>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Feature</span></th>
                {options.map((option) => <th key={option} scope="col" className={option === siteName ? "text-foreground!" : undefined}>{option}</th>)}
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="font-medium">{row.label}</th>
                  {row.values.map((value, index) => <td key={options[index]}>{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-muted text-[12px] leading-[1.6]">Checked against each product&apos;s documentation and pricing pages on {compareChecked}. Sources are listed below.</p>
      </section>

      <section aria-labelledby="choose-heading" className="mt-12 max-w-185">
        <h2 id="choose-heading" className={heading}>Which one fits</h2>
        <dl className="mt-2">
          {choices.map((choice) => (
            <div key={choice.name} className="border-b border-solid border-border py-4.5 last:border-b-0">
              <dt className="text-[15px] font-medium">Choose {choice.name} if</dt>
              <dd className="mt-1.5 text-muted text-[14px] leading-[1.8]">{choice.when}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="build-heading" className="mt-10 max-w-185">
        <h2 id="build-heading" className={heading}>What building it yourself takes</h2>
        <p className="mt-2 text-muted text-[14px] leading-[1.8]">A first version is one HTTP request. A version your customers can rely on needs all of this:</p>
        <ul className="mt-3 pl-5.5 [list-style:disc] [&_li]:mt-1.5 [&_li]:text-muted [&_li]:text-[14px] [&_li]:leading-[1.75]">
          {buildChecklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="mt-4 text-muted text-[14px] leading-[1.8]">
          The <DocsLink path="/docs/guides/send-webhooks" className={textLink}>guide to sending webhooks from your app</DocsLink> walks through each piece, whichever way you go.
        </p>
      </section>

      <section aria-labelledby="try-heading" className="mt-12 max-w-185 rounded-[14px] border border-solid border-border bg-surface p-6 max-[37.5rem]:p-5">
        <h2 id="try-heading" className={heading}>Try {siteName}</h2>
        <p className="mt-2 text-muted text-[14px] leading-[1.8]">Create a project, verify an endpoint, and publish your first event. It&apos;s free during early access.</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/login" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-accent hover:underline hover:underline-offset-4">
            Get started <ArrowRightIcon size={16} aria-hidden="true" />
          </Link>
          <DocsLink path="/docs/quickstart" className="inline-flex min-h-11 items-center text-[14px] hover:underline hover:underline-offset-4">Read the quickstart</DocsLink>
        </div>
      </section>

      <section aria-labelledby="sources-heading" className="mt-12 max-w-185">
        <h2 id="sources-heading" className="text-[13px] font-medium text-muted">Sources</h2>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-[1.8]">
          {compareSources.map((source) => (
            <li key={source.href}><a href={source.href} className="text-muted underline underline-offset-[3px] hover:text-foreground" target="_blank" rel="noopener noreferrer">{source.label}</a></li>
          ))}
        </ul>
        <p className="mt-4 text-muted text-[12px] leading-[1.6]">
          {compareDisclosure} If something is wrong or out of date, <a href={`mailto:${supportEmail}`} className="underline underline-offset-[3px] hover:text-foreground">email us</a> and we&apos;ll fix it.
        </p>
        <p className="mt-2 text-muted text-[12px] leading-[1.6]">{compareTrademark}</p>
      </section>
    </div>
  );
}
