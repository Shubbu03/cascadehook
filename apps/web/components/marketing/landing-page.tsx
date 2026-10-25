import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CodeIcon,
  GitBranchIcon,
  LightningIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { CopyButton } from "@/components/copy-button";
import { MobileNav } from "@/components/marketing/mobile-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { publicationExample } from "@/lib/example";

function DeliveryExample() {
  return (
    <figure className="delivery-example">
      <figcaption className="example-caption">
        <span>
          <span className="small-square" />
          Event → endpoint
        </span>
        <span>Example</span>
      </figcaption>
      <div className="example-event">
        <div className="example-event-icon">
          <LightningIcon size={24} aria-hidden="true" />
        </div>
        <div>
          <span className="field-label">Event</span>
          <p className="mono">invoice.paid</p>
        </div>
        <span className="status status-neutral">202 accepted</span>
      </div>
      <div className="example-connector" aria-hidden="true">
        <span />
        <ArrowDownIcon size={16} />
        <span />
      </div>
      <div className="example-delivery">
        <div className="example-delivery-heading">
          <div>
            <span className="field-label">Endpoint</span>
            <p className="mono">/webhooks/billing</p>
          </div>
          <span className="status status-success">
            <CheckCircleIcon size={14} aria-hidden="true" />
            Delivered
          </span>
        </div>
        <ol className="attempt-list">
          <li>
            <span className="attempt-dot attempt-warning" />
            <span className="attempt-number">01</span>
            <span>Service unavailable</span>
            <code className="text-warning">503</code>
          </li>
          <li className="attempt-retry">
            <span aria-hidden="true" />
            <span className="attempt-retry-copy">
              <ArrowsClockwiseIcon size={13} aria-hidden="true" />
              Automatic retry
            </span>
          </li>
          <li>
            <span className="attempt-dot attempt-success" />
            <span className="attempt-number">02</span>
            <span>Delivered</span>
            <code className="text-success">200</code>
          </li>
        </ol>
        <div className="example-delivery-footer">
          <ShieldCheckIcon size={16} aria-hidden="true" />
          <span>HMAC-signed requests</span>
        </div>
      </div>
    </figure>
  );
}

const steps = [
  {
    number: "01",
    title: "Connect an endpoint",
    text: "Add an HTTPS URL, choose event types, and verify ownership.",
    Icon: GitBranchIcon,
  },
  {
    number: "02",
    title: "Publish an event",
    text: "Send a payload. We sign and deliver it to subscribed endpoints.",
    Icon: CodeIcon,
  },
  {
    number: "03",
    title: "Track delivery",
    text: "Inspect every attempt, with automatic retries when delivery fails.",
    Icon: CheckCircleIcon,
  },
];

export function LandingPage() {
  return (
    <div className="marketing-page">
      <header className="site-header page-width">
        <Brand href={null} />
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/docs/quickstart">Quickstart</Link>
        </nav>
        <div className="header-actions">
          <ThemeSwitcher />
          <Link href="/sign-in" className="header-sign-in">
            Sign in
          </Link>
          <Link href="/sign-up" className="button button-small button-primary">
            Get started
            <ArrowUpRightIcon size={16} aria-hidden="true" />
          </Link>
          <MobileNav />
        </div>
      </header>

      <main id="main-content">
        <section className="hero page-width">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow">
              <span className="small-square" />
              Outbound webhooks
            </div>
            <h1>
              Webhooks,
              <br />
              <span>delivered.</span>
            </h1>
            <p className="hero-description">
              Send signed webhooks, retry failures, and track every delivery.
            </p>
            <div className="hero-actions">
              <Link href="/sign-up" className="button button-primary">
                Get started
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Link>
              <Link href="/docs/quickstart" className="button button-quiet">
                View quickstart
                <ArrowDownIcon size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <DeliveryExample />
        </section>

        <section
          id="how-it-works"
          className="how-section page-width"
          aria-labelledby="how-heading"
        >
          <h2 id="how-heading">How it works</h2>
          <ol className="steps-grid">
            {steps.map(({ number, title, text, Icon }) => (
              <li className="step" key={number}>
                <div className="step-top">
                  <span className="mono">{number}</span>
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="quickstart"
          className="integration-section"
          aria-labelledby="quickstart-heading"
        >
          <div className="page-width integration-grid">
            <div className="integration-copy">
              <h2 id="quickstart-heading">Your first event.</h2>
              <p>Publish JSON with your project API key. We handle delivery.</p>
              <Link href="/sign-up" className="text-link text-accent">
                Create an account
                <ArrowUpRightIcon size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="code-example">
              <div className="code-example-header">
                <span>
                  <TerminalWindowIcon size={17} aria-hidden="true" />
                  Example request
                </span>
                <CopyButton
                  value={publicationExample}
                  label="Copy cURL"
                  successMessage="Example copied."
                />
              </div>
              <pre>
                <code>{publicationExample}</code>
              </pre>
              <div className="code-example-footer">
                <span className="status status-success">202 Accepted</span>
                <span>Queued for delivery</span>
              </div>
              <p className="code-example-note">
                Replace the API host and project key.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer page-width">
        <div className="footer-brand">
          <Brand href={null} />
          <p>Webhooks, delivered.</p>
        </div>
      </footer>
    </div>
  );
}
