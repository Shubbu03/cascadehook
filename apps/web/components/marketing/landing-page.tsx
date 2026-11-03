import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { DeliveryExample } from "@/components/marketing/delivery-example";
import { FooterWordmark } from "@/components/marketing/footer-wordmark";
import { IntegrationCode } from "@/components/marketing/integration-code";
import { LandingMotion } from "@/components/marketing/landing-motion";
import { MarketingHeader } from "@/components/marketing/marketing-header";

const signatureExample = [
  'const key = decodeSecret(signingSecret);',
  'const id = verifyWebhook(rawBody, req.headers, key);',
  '// Verify before parsing the request body.',
].join("\n");

export function LandingPage() {
  return (
    <LandingMotion>
      <MarketingHeader home />
      <main id="main-content" className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] mx-auto">
        <section className="grid grid-cols-[1.05fr_1fr] min-h-[calc(100svh-var(--landing-header-height))] content-center items-center pt-21.5 pb-19.5 border-b [border-bottom-style:solid] border-b-border gap-14 max-[68.75rem]:gap-9.5 max-[68.75rem]:py-16 max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-9 max-[53.125rem]:py-13 max-[37.5rem]:gap-8 max-[37.5rem]:py-9.5 [&_h1]:mt-6.75 [&_h1]:text-[clamp(48px,6vw,86px)] [&_h1]:font-normal [&_h1]:leading-[1.06] [&_h1]:tracking-[-0.055em] max-[53.125rem]:[&_h1]:text-[clamp(58px,9vw,76px)] max-[37.5rem]:[&_h1]:mt-5.25 max-[37.5rem]:[&_h1]:text-[clamp(43px,10.8vw,64px)] [&_h1_>_span]:block [&_h1_>_span]:text-accent" aria-labelledby="hero-heading">
          <div className="min-w-0 max-[53.125rem]:max-w-155">
            <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Outbound webhooks, without the upkeep.</p>
            <h1 id="hero-heading">Webhooks,<span>taken care of.</span></h1>
            <p className="max-w-125 mt-7 text-muted text-[16px] leading-[1.85] max-[37.5rem]:mt-5.75 max-[37.5rem]:text-[15px] max-[37.5rem]:leading-[1.8]">
              Send events to your customers without building the delivery infrastructure.
              Signed requests, automatic retries and a record of every attempt are built in.
            </p>
            <div className="flex items-center flex-wrap gap-y-3 gap-x-6 mt-8 max-[37.5rem]:gap-y-2.5 max-[37.5rem]:gap-x-5 max-[37.5rem]:mt-6">
              <Link href="/login" className="inline-flex items-center justify-center min-h-12 rounded-[100px] font-medium text-center whitespace-nowrap [transition:background-color_140ms,border-color_140ms] bg-foreground text-background gap-5 py-3 px-5.25 border border-solid border-transparent text-sm/normal max-[37.5rem]:text-[13px] max-[37.5rem]:gap-4.5 max-[37.5rem]:px-4.5 motion-reduce:transition-none motion-safe:[&_>_svg]:[transition:transform_180ms_ease-out] [&:hover]:bg-[color-mix(in_srgb,var(--foreground)_84%,var(--background))] [[data-ui~='landing-closing']_>_&]:shrink-0 motion-safe:[&:focus-visible_>_svg]:transform-[translateX(3px)] motion-safe:[@media(hover:_hover)_and_(pointer:_fine)]:[&:hover_>_svg]:transform-[translateX(3px)]">
                Get started <ArrowRightIcon size={18} aria-hidden="true" />
              </Link>
              <DocsLink path="/docs/quickstart" className="inline-flex items-center min-h-11 text-[14px] gap-2.5 max-[37.5rem]:text-[13px] [&:hover]:underline [&:hover]:underline-offset-[5px] in-data-[ui~='landing-integration-copy']:mt-6 in-data-[ui~='landing-integration-copy']:text-accent">Read the quickstart</DocsLink>
            </div>
          </div>
          <DeliveryExample />
        </section>
        <section id="how-it-works" className="grid grid-cols-[0.9fr_1.1fr] items-start gap-16 py-19.5 max-[68.75rem]:gap-12 max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-9.5 max-[53.125rem]:py-12 max-[37.5rem]:py-9.5" aria-labelledby="story-heading">
          <div className="[&_h2]:max-w-110 [&_h2]:mt-5.5 [&_h2]:text-[clamp(32px,3.6vw,44px)] [&_h2]:font-normal [&_h2]:leading-[1.18] [&_h2]:tracking-[-0.045em] [&_h2]:text-balance max-[53.125rem]:[&_h2]:max-w-107.5 max-[53.125rem]:[&_h2]:text-[38px] max-[37.5rem]:[&_h2]:mt-4 max-[37.5rem]:[&_h2]:text-[34px] [&_h2_span]:text-accent" data-motion="reveal">
            <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Behind every delivery</p>
            <h2 id="story-heading">A clear path from event to <span>endpoint.</span></h2>
            <p className="max-w-105 mt-6.25 text-muted text-[15px] leading-[1.85] max-[53.125rem]:max-w-125 max-[37.5rem]:mt-4.5 max-[37.5rem]:text-[14px]">
              Queues, retries, signing and delivery logs add up. Cascadehook handles them together,
              so they stay off your team&apos;s to-do list.
            </p>
          </div>
          <ol data-ui="landing-feature-list" className={"grid list-none m-0 p-0 [&_>_li]:grid [&_>_li]:grid-cols-[24px_minmax(0,1fr)] [&_>_li]:items-start [&_>_li]:border-b [&_>_li]:[border-bottom-style:solid] [&_>_li]:border-b-border [&_>_li]:gap-5 [&_>_li]:py-7.5 [&_h3]:text-[18px] [&_h3]:font-medium [&_h3]:leading-[1.4] [&_h3]:tracking-[-0.02em] [&_p]:mt-2.75 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] max-[37.5rem]:[&_>_li]:grid-cols-[20px_minmax(0,1fr)] max-[37.5rem]:[&_>_li]:gap-3.5 max-[37.5rem]:[&_>_li]:py-6 max-[37.5rem]:[&_h3]:text-[17px] max-[37.5rem]:[&_p]:text-[13px] [&_>_li:first-child]:pt-0 [&_>_li:last-child]:pb-0 [&_>_li:last-child]:border-b-0 [&_>_li:last-child]:[border-bottom-style:none] [&_>_li:last-child]:border-b-[currentColor] motion-safe:[&[data-visible=\"true\"]_>_li]:animate-landing-content-reveal-staggered motion-safe:[&[data-visible=\"true\"]_>_li:nth-child(2)]:[animation-delay:110ms] motion-safe:[&[data-visible=\"true\"]_>_li:nth-child(3)]:[animation-delay:220ms]"} data-motion="stagger">
            <li>
              <span className="pt-1 text-accent font-mono text-[11px]" aria-hidden="true">01</span>
              <div>
                <h3>Temporary failures get another try.</h3>
                <p>Timeouts and retryable errors are rescheduled automatically, and every outcome is recorded.</p>
                <div className="flex flex-wrap mt-4.75 gap-1.75 max-[37.5rem]:gap-1.5 [&_span]:rounded-md [&_span]:text-muted [&_span]:font-mono [&_span]:text-[11px] [&_span]:py-1.75 [&_span]:px-2.25 [&_span]:border [&_span]:border-solid [&_span]:border-border max-[37.5rem]:[&_span]:px-1.75" aria-label="Retry intervals start around 15 seconds and one minute, with up to eight attempts">
                  <span>1 · now</span><span>2 · ~15s</span><span>3 · ~1m later</span><span>… up to 8</span>
                </div>
                <p className="mt-2.25 text-[11px] max-[37.5rem]:text-[11px]">Backoff includes jitter. Retry-After can extend the wait.</p>
              </div>
            </li>
            <li>
              <span className="pt-1 text-accent font-mono text-[11px]" aria-hidden="true">02</span>
              <div>
                <h3>A signature with every request.</h3>
                <p>Each webhook is HMAC-signed, so receivers can verify it came from you.</p>
                <pre className="mt-4.75 mb-0 rounded-[9px] bg-surface overflow-x-auto text-[11px] leading-[1.9] p-3.75 mx-0 border border-solid border-border"><code>{signatureExample}</code></pre>
                <DocsLink className="inline-flex items-center min-h-11 mt-1 text-accent text-[12px] gap-1.75 [&:hover]:underline [&:hover]:underline-offset-[5px]" path="/docs/security/signatures">
                  Verify with the receiver guide <ArrowUpRightIcon size={13} aria-hidden="true" />
                </DocsLink>
              </div>
            </li>
            <li>
              <span className="pt-1 text-accent font-mono text-[11px]" aria-hidden="true">03</span>
              <div>
                <h3>Know what happened. Choose what comes next.</h3>
                <p>Inspect each attempt&apos;s status and duration, then replay a delivery when the endpoint is ready.</p>
                <DocsLink className="inline-flex items-center min-h-11 mt-1 text-accent text-[12px] gap-1.75 [&:hover]:underline [&:hover]:underline-offset-[5px]" path="/docs/concepts/deliveries">
                  Explore delivery logs and replay <ArrowUpRightIcon size={13} aria-hidden="true" />
                </DocsLink>
              </div>
            </li>
          </ol>
        </section>
        <section id="quickstart" className="pt-13.5 pb-16 [border-top-style:solid] [border-bottom-style:solid] border-y border-y-border max-[37.5rem]:py-9.5" aria-labelledby="quickstart-heading">
          <div className="grid grid-cols-[0.9fr_1.1fr] items-start gap-14 max-[68.75rem]:gap-9.5 max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-7.5">
            <div data-ui="landing-integration-copy" className="[&_h2]:mt-5.25 [&_h2]:text-[clamp(28px,3vw,36px)] [&_h2]:font-normal [&_h2]:leading-[1.2] [&_h2]:tracking-[-0.04em] max-[37.5rem]:[&_h2]:mt-4.25 max-[37.5rem]:[&_h2]:text-[29px] [&_>_p:not([data-ui~='landing-eyebrow'])]:max-w-105 [&_>_p:not([data-ui~='landing-eyebrow'])]:mt-5.5 [&_>_p:not([data-ui~='landing-eyebrow'])]:text-muted [&_>_p:not([data-ui~='landing-eyebrow'])]:text-[15px] [&_>_p:not([data-ui~='landing-eyebrow'])]:leading-[1.85] max-[53.125rem]:[&_>_p:not([data-ui~='landing-eyebrow'])]:max-w-125 max-[37.5rem]:[&_>_p:not([data-ui~='landing-eyebrow'])]:text-[14px]" data-motion="reveal">
              <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Your first event is one API call away.</p>
              <h2 id="quickstart-heading">Connect an endpoint.<br />Publish an event.</h2>
              <p>
                Once your endpoint is verified, send an event with your project API key.
                Cascadehook delivers it to every endpoint subscribed to that event type.
              </p>
              <DocsLink path="/docs/quickstart" className="inline-flex items-center min-h-11 text-[14px] gap-2.5 max-[37.5rem]:text-[13px] [&:hover]:underline [&:hover]:underline-offset-[5px] mt-6 text-accent">
                Follow the quickstart <ArrowRightIcon size={16} aria-hidden="true" />
              </DocsLink>
            </div>
            <IntegrationCode />
          </div>
        </section>
        <section data-ui="landing-closing" className="flex items-center justify-between gap-7 py-15.5 max-[37.5rem]:flex-col max-[37.5rem]:items-start max-[37.5rem]:gap-5.75 max-[37.5rem]:py-9.5 [&_h2]:text-[clamp(27px,3.2vw,39px)] [&_h2]:font-normal [&_h2]:leading-tight [&_h2]:tracking-[-0.04em] [&_h2]:text-balance [&_p]:mt-3.75 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] max-[37.5rem]:[&_h2]:text-[29px] max-[37.5rem]:[&_p]:text-[13px]" aria-labelledby="closing-heading" data-motion="reveal">
          <div>
            <h2 id="closing-heading">Make room for your next feature.</h2>
            <p>Create a project, connect an endpoint and send your first event.</p>
          </div>
          <Link href="/login" className="inline-flex items-center justify-center min-h-12 rounded-[100px] font-medium text-center whitespace-nowrap [transition:background-color_140ms,border-color_140ms] bg-foreground text-background gap-5 py-3 px-5.25 border border-solid border-transparent text-sm/normal max-[37.5rem]:text-[13px] max-[37.5rem]:gap-4.5 max-[37.5rem]:px-4.5 motion-reduce:transition-none motion-safe:[&_>_svg]:[transition:transform_180ms_ease-out] [&:hover]:bg-[color-mix(in_srgb,var(--foreground)_84%,var(--background))] [[data-ui~='landing-closing']_>_&]:shrink-0 motion-safe:[&:focus-visible_>_svg]:transform-[translateX(3px)] motion-safe:[@media(hover:_hover)_and_(pointer:_fine)]:[&:hover_>_svg]:transform-[translateX(3px)]">
            Get started <ArrowRightIcon size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="pt-11.5 border-t [border-top-style:solid] border-t-border overflow-hidden max-[37.5rem]:pt-8">
        <div className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] mx-auto">
          <div className="flex items-center justify-between pb-7 border-b [border-bottom-style:solid] border-b-border gap-8 max-[53.125rem]:flex-col max-[53.125rem]:items-start max-[53.125rem]:gap-5 max-[37.5rem]:pb-6">
            <div className="min-w-0 [&_p]:max-w-85 [&_p]:mt-3.5 [&_p]:text-muted [&_p]:text-[13px] [&_p]:leading-[1.7]">
              <Brand href={null} />
              <p>Signed webhooks, automatic retries and delivery logs.</p>
            </div>
            <nav className={"flex items-center flex-wrap gap-y-2 gap-x-7 max-[37.5rem]:gap-y-1 max-[37.5rem]:gap-x-5 [&_a]:relative [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-11 [&_a]:text-muted [&_a]:text-[13px] [&_a]:gap-1.5 pointer-coarse:[&_a]:min-h-11 motion-safe:[&_a]:[transition:transform_180ms_ease-out,color_180ms_ease-out] [&_a:hover]:text-foreground [&_a::after]:content-[''] [&_a::after]:absolute [&_a::after]:bottom-2 [&_a::after]:h-0.5 [&_a::after]:rounded-[1px] [&_a::after]:bg-accent [&_a::after]:transform-[scaleX(0)] [&_a::after]:origin-[left_center] [&_a::after]:pointer-events-none [&_a::after]:inset-x-0 [&_a:focus-visible]:text-foreground motion-safe:[&_a::after]:[transition:transform_240ms_cubic-bezier(0.22,1,0.36,1)] motion-safe:[&_a:focus-visible]:transform-[translateY(-2px)] motion-safe:[@media(hover:_hover)_and_(pointer:_fine)]:[&_a:hover]:transform-[translateY(-2px)] [&_a:focus-visible::after]:transform-[scaleX(1)] [@media(hover:_hover)_and_(pointer:_fine)]:[&_a:hover::after]:transform-[scaleX(1)]"} aria-label="Footer navigation">
              <DocsLink path="/docs">Docs</DocsLink>
              <DocsLink path="/docs/api">API reference</DocsLink>
              <Link href="/support">Support</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <a href="https://github.com/Shubbu03/cascadehook" target="_blank" rel="noopener noreferrer">
                GitHub <ArrowUpRightIcon size={13} aria-hidden="true" />
              </a>
            </nav>
          </div>
          <div className="pt-5 text-muted text-[11px]">
            <span>© 2026 Cascadehook. All rights reserved.</span>
          </div>
        </div>
        <FooterWordmark />
      </footer>
    </LandingMotion>
  );
}
