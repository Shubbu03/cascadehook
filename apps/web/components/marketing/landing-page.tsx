import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import { DeliveryExample } from "@/components/marketing/delivery-example";
import { FaqList } from "@/components/marketing/faq-list";
import { IntegrationCode } from "@/components/marketing/integration-code";
import { LandingMotion } from "@/components/marketing/landing-motion";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { AttemptLog } from "@/components/marketing/story/attempt-log";
import { CascadeTrack } from "@/components/marketing/story/cascade-track";
import { Chapter, chapterCopy } from "@/components/marketing/story/chapter";
import { FanOut } from "@/components/marketing/story/fan-out";
import { Receipt } from "@/components/marketing/story/receipt";
import { RetryTimeline } from "@/components/marketing/story/retry-timeline";
import { Signature } from "@/components/marketing/story/signature";
import { TripCost } from "@/components/marketing/story/trip-cost";
import { homeFaq } from "@/features/marketing/home-content";
import { deliveryLimits } from "@/features/marketing/limits";
import { retrySchedule, storyAttempts, storyEvent } from "@/features/marketing/story";
import { supportEmail } from "@/lib/support";

const primaryButton = "inline-flex items-center justify-center min-h-12 rounded-[100px] font-medium text-center whitespace-nowrap [transition:background-color_140ms,border-color_140ms] bg-foreground text-background gap-5 py-3 px-5.25 border border-solid border-transparent text-sm/normal max-[37.5rem]:text-[13px] max-[37.5rem]:gap-4.5 max-[37.5rem]:px-4.5 motion-reduce:transition-none motion-safe:[&_>_svg]:[transition:transform_180ms_ease-out] [&:hover]:bg-[color-mix(in_srgb,var(--foreground)_84%,var(--background))] motion-safe:[&:focus-visible_>_svg]:transform-[translateX(3px)] motion-safe:[@media(hover:_hover)_and_(pointer:_fine)]:[&:hover_>_svg]:transform-[translateX(3px)]";
const faqSplit = Math.ceil(homeFaq.length / 2);
const chapterLink = "mt-6 inline-flex min-h-11 items-center gap-2.5 text-[14px] text-accent hover:underline hover:underline-offset-[5px] max-[37.5rem]:text-[13px]";

export function LandingPage() {
  return (
    <LandingMotion>
      <MarketingHeader home />
      <main id="main-content" className="w-[min(1320px,calc(100%-clamp(40px,6vw,96px)))] mx-auto">
        <CascadeTrack>
          <section className="relative z-1 grid grid-cols-[1.05fr_1fr] min-h-[calc(100svh-var(--landing-header-height))] content-center items-center pt-21.5 pb-19.5 gap-14 max-[68.75rem]:gap-9.5 max-[68.75rem]:py-16 max-[53.125rem]:grid-cols-[minmax(0,1fr)] max-[53.125rem]:gap-9 max-[53.125rem]:py-13 max-[37.5rem]:gap-8 max-[37.5rem]:py-9.5 [&_h1]:mt-6.75 [&_h1]:text-[clamp(48px,6vw,86px)] [&_h1]:font-normal [&_h1]:leading-[1.06] [&_h1]:tracking-[-0.055em] max-[53.125rem]:[&_h1]:text-[clamp(58px,9vw,76px)] max-[37.5rem]:[&_h1]:mt-5.25 max-[37.5rem]:[&_h1]:text-[clamp(43px,10.8vw,64px)] [&_h1_>_span]:block [&_h1_>_span]:text-accent" aria-labelledby="hero-heading">
            <div className="min-w-0 max-[53.125rem]:max-w-155">
              <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">Webhook delivery for SaaS and API teams</p>
              <h1 id="hero-heading">Outbound webhooks,<span>taken care of.</span></h1>
              <p className="max-w-125 mt-7 text-muted text-[16px] leading-[1.85] max-[37.5rem]:mt-5.75 max-[37.5rem]:text-[15px] max-[37.5rem]:leading-[1.8]">
                Publish an event once. Cascadehook signs it, delivers it to every subscribed endpoint,
                retries failures for up to 72 hours and records every attempt, so you don&apos;t have to build the delivery infrastructure.
              </p>
              <div className="flex items-center flex-wrap gap-y-3 gap-x-6 mt-8 max-[37.5rem]:gap-y-2.5 max-[37.5rem]:gap-x-5 max-[37.5rem]:mt-6">
                <Link href="/login" className={primaryButton}>
                  Get started <ArrowRightIcon size={18} aria-hidden="true" />
                </Link>
                <DocsLink path="/docs/quickstart" className="inline-flex items-center min-h-11 text-[14px] gap-2.5 max-[37.5rem]:text-[13px] [&:hover]:underline [&:hover]:underline-offset-[5px]">Read the quickstart</DocsLink>
              </div>
            </div>
            <DeliveryExample />
          </section>
          <div className="border-b border-b-border">
            <Chapter id="how-it-works" marker="01" eyebrow="Publish" title={<>Your app sends it <span>once.</span></>} visual={<IntegrationCode />}>
              <p className={chapterCopy}>
                One API call with an <code>Idempotency-Key</code>. Cascadehook stores the event and creates a delivery for every endpoint
                subscribed to <code>{storyEvent.type}</code>, in a single transaction. Send the same key again within 24 hours and you get the
                same event back, so retrying a publish never creates a duplicate.
              </p>
              <DocsLink path="/docs/quickstart" className={chapterLink}>Follow the quickstart <ArrowRightIcon size={16} aria-hidden="true" /></DocsLink>
            </Chapter>
            <Chapter id="fan-out" marker="02" side="right" eyebrow="Fan out" title={<>Three endpoints are listening. Each gets <span>its own delivery.</span></>}
              visual={<FanOut caption={<><code>delivery_count: 3</code>. One delivery for each subscribed, enabled, and verified endpoint, tracked separately, so a slow receiver never holds up the others.</>} />}>
              <p className={chapterCopy}>Two endpoints answer right away. Your billing service is in the middle of a deploy and returns 503. Follow that one.</p>
            </Chapter>
            <Chapter id="signing" marker="03" eyebrow="Sign" title={<>Every request carries proof it <span>came from you.</span></>} visual={<Signature />}>
              <p className={chapterCopy}>
                Each request is signed with HMAC-SHA256 over the delivery ID, the timestamp, and the raw body, in Standard Webhooks headers.
                Your receiver checks the signature before it trusts a single byte.
              </p>
            </Chapter>
            <Chapter id="retries" marker="04" side="right" eyebrow="Retry" title={<>The endpoint is down. Cascadehook waits, then <span>tries again.</span></>} visual={<RetryTimeline />}>
              <p className={chapterCopy}>
                Retryable failures get up to {deliveryLimits.attempts} attempts, with waits that grow from {retrySchedule[1].wait} to {retrySchedule[retrySchedule.length - 1].wait}.
                This one recovers on attempt {storyAttempts.length}, about a minute after the first try.
              </p>
            </Chapter>
            <Chapter id="replay" marker="05" eyebrow="Record and replay" title={<>Every attempt is on the record. Replay <span>when you need to.</span></>} visual={<AttemptLog />}>
              <p className={chapterCopy}>
                The dashboard and API show every attempt for as long as your plan keeps history. If a receiver had a bug, fix it and replay
                the delivery.
              </p>
            </Chapter>
            <section id="everything" aria-labelledby="everything-heading" className="group/finale relative z-1 pt-16 pb-20 max-[37.5rem]:pt-12 max-[37.5rem]:pb-12">
              <Receipt />
            </section>
          </div>
        </CascadeTrack>
        <div className="border-b border-b-border">
          <TripCost />
        </div>
        <section id="faq" aria-labelledby="faq-heading" className="border-b border-b-border py-20 max-[53.125rem]:py-16 max-[37.5rem]:py-12" data-motion="reveal">
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
            <div>
              <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6]">FAQ</p>
              <h2 id="faq-heading" className="mt-4 text-[clamp(30px,3.4vw,42px)] font-normal leading-[1.16] tracking-[-0.045em] max-[37.5rem]:text-[29px]">Questions teams ask first.</h2>
            </div>
            <a href={`mailto:${supportEmail}`} className="inline-flex min-h-11 items-center gap-2.5 text-[14px] text-accent hover:underline hover:underline-offset-[5px]">
              Ask us something else <ArrowRightIcon size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="mt-10 grid grid-cols-2 items-start gap-4 max-[53.125rem]:grid-cols-[minmax(0,1fr)]">
            <FaqList items={homeFaq.slice(0, faqSplit)} />
            <FaqList items={homeFaq.slice(faqSplit)} />
          </div>
        </section>
        <section data-ui="landing-closing" className="flex items-center justify-between gap-7 py-15.5 max-[37.5rem]:flex-col max-[37.5rem]:items-start max-[37.5rem]:gap-5.75 max-[37.5rem]:py-9.5 [&_h2]:text-[clamp(27px,3.2vw,39px)] [&_h2]:font-normal [&_h2]:leading-tight [&_h2]:tracking-[-0.04em] [&_h2]:text-balance [&_h2_code]:text-accent [&_h2_code]:text-[0.82em] [&_p]:mt-3.75 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] max-[37.5rem]:[&_h2]:text-[29px] max-[37.5rem]:[&_p]:text-[13px]" aria-labelledby="closing-heading" data-motion="reveal">
          <div>
            <h2 id="closing-heading">Your next <code>{storyEvent.type}</code> is one API call away.</h2>
            <p>Create a project, verify an endpoint, and publish your first event.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
            <DocsLink path="/docs/quickstart" className="inline-flex min-h-11 items-center text-[14px] hover:underline hover:underline-offset-[5px]">Read the quickstart</DocsLink>
            <Link href="/login" className={primaryButton}>
              Get started <ArrowRightIcon size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </LandingMotion>
  );
}
