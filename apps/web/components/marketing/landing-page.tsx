import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { DocsLink } from "@/components/docs-link";
import { DeliveryExample } from "@/components/marketing/delivery-example";
import { FooterWordmark } from "@/components/marketing/footer-wordmark";
import { IntegrationCode } from "@/components/marketing/integration-code";
import { LandingMotion } from "@/components/marketing/landing-motion";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";

const signatureExample = [
  'const key = decodeSecret(signingSecret);',
  'const id = verifyWebhook(rawBody, req.headers, key);',
  '// Verify before parsing the request body.',
].join("\n");

export function LandingPage() {
  return (
    <LandingMotion>
      <header className="landing-header landing-container">
        <Brand href={null} />
        <nav className="landing-desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <DocsLink path="/docs">Docs</DocsLink>
        </nav>
        <div className="landing-header-actions">
          <ThemeSwitcher />
          <Link href="/login" className="landing-header-cta">
            Get started <ArrowUpRightIcon size={16} aria-hidden="true" />
          </Link>
          <MobileNav />
        </div>
      </header>
      <main id="main-content" className="landing-container">
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Outbound webhooks, without the upkeep.</p>
            <h1 id="hero-heading">Webhooks,<span>taken care of.</span></h1>
            <p className="landing-hero-description">
              Send events to your customers without building the delivery infrastructure.
              Signed requests, automatic retries and a record of every attempt are built in.
            </p>
            <div className="landing-hero-actions">
              <Link href="/login" className="landing-primary-cta">
                Get started <ArrowRightIcon size={18} aria-hidden="true" />
              </Link>
              <DocsLink path="/docs/quickstart" className="landing-text-link">Read the quickstart</DocsLink>
            </div>
          </div>
          <DeliveryExample />
        </section>
        <section id="how-it-works" className="landing-story" aria-labelledby="story-heading">
          <div className="landing-story-copy" data-motion="reveal">
            <p className="landing-eyebrow">Behind every delivery</p>
            <h2 id="story-heading">A clear path from event to <span>endpoint.</span></h2>
            <p className="landing-story-description">
              Queues, retries, signing and delivery logs add up. Cascadehook handles them together,
              so they stay off your team&apos;s to-do list.
            </p>
          </div>
          <ol className="landing-feature-list" data-motion="stagger">
            <li>
              <span className="landing-feature-number" aria-hidden="true">01</span>
              <div>
                <h3>Temporary failures get another try.</h3>
                <p>Timeouts and retryable errors are rescheduled automatically, and every outcome is recorded.</p>
                <div className="landing-retry-timeline" aria-label="Retry intervals start around 15 seconds and one minute, with up to eight attempts">
                  <span>1 · now</span><span>2 · ~15s</span><span>3 · ~1m later</span><span>… up to 8</span>
                </div>
                <p className="landing-feature-note">Backoff includes jitter. Retry-After can extend the wait.</p>
              </div>
            </li>
            <li>
              <span className="landing-feature-number" aria-hidden="true">02</span>
              <div>
                <h3>A signature with every request.</h3>
                <p>Each webhook is HMAC-signed, so receivers can verify it came from you.</p>
                <pre className="landing-signature-example"><code>{signatureExample}</code></pre>
                <DocsLink className="landing-feature-link" path="/docs/security/signatures">
                  Verify with the receiver guide <ArrowUpRightIcon size={13} aria-hidden="true" />
                </DocsLink>
              </div>
            </li>
            <li>
              <span className="landing-feature-number" aria-hidden="true">03</span>
              <div>
                <h3>Know what happened. Choose what comes next.</h3>
                <p>Inspect each attempt&apos;s status and duration, then replay a delivery when the endpoint is ready.</p>
                <DocsLink className="landing-feature-link" path="/docs/concepts/deliveries">
                  Explore delivery logs and replay <ArrowUpRightIcon size={13} aria-hidden="true" />
                </DocsLink>
              </div>
            </li>
          </ol>
        </section>
        <section id="quickstart" className="landing-integration" aria-labelledby="quickstart-heading">
          <div className="landing-integration-content">
            <div className="landing-integration-copy" data-motion="reveal">
              <p className="landing-eyebrow">Your first event is one API call away.</p>
              <h2 id="quickstart-heading">Connect an endpoint.<br />Publish an event.</h2>
              <p>
                Once your endpoint is verified, send an event with your project API key.
                Cascadehook delivers it to every endpoint subscribed to that event type.
              </p>
              <DocsLink path="/docs/quickstart" className="landing-text-link">
                Follow the quickstart <ArrowRightIcon size={16} aria-hidden="true" />
              </DocsLink>
            </div>
            <IntegrationCode />
          </div>
        </section>
        <section className="landing-closing" aria-labelledby="closing-heading" data-motion="reveal">
          <div>
            <h2 id="closing-heading">Make room for your next feature.</h2>
            <p>Create a project, connect an endpoint and send your first event.</p>
          </div>
          <Link href="/login" className="landing-primary-cta">
            Get started <ArrowRightIcon size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-main">
            <div className="landing-footer-identity">
              <Brand href={null} />
              <p>Signed webhooks, automatic retries and delivery logs.</p>
            </div>
            <nav className="landing-footer-links" aria-label="Footer navigation">
              <DocsLink path="/docs">Docs</DocsLink>
              <DocsLink path="/docs/api">API reference</DocsLink>
              <a href="https://github.com/Shubbu03/cascadehook" target="_blank" rel="noopener noreferrer">
                GitHub <ArrowUpRightIcon size={13} aria-hidden="true" />
              </a>
            </nav>
          </div>
          <div className="landing-footer-bottom">
            <span>© 2026 Cascadehook. All rights reserved.</span>
          </div>
        </div>
        <FooterWordmark />
      </footer>
    </LandingMotion>
  );
}
