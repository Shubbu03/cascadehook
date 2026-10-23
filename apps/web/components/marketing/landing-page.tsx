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
          EVENT → ENDPOINT
        </span>
        <span>ILLUSTRATIVE EXAMPLE</span>
      </figcaption>
      <div className="example-event">
        <div className="example-event-icon">
          <LightningIcon size={24} aria-hidden="true" />
        </div>
        <div>
          <span className="field-label">Your application publishes</span>
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
            <span className="field-label">Delivery destination</span>
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
            <span>Successfully delivered</span>
            <code className="text-success">200</code>
          </li>
        </ol>
        <div className="example-delivery-footer">
          <ShieldCheckIcon size={16} aria-hidden="true" />
          <span>Signed. Retried. Accounted for.</span>
        </div>
      </div>
      <p className="example-note">
        <span className="note-line" />
        You publish once. We handle the follow-through.
      </p>
    </figure>
  );
}

const steps = [
  {
    number: "01",
    title: "Give your events a destination.",
    text: "Register an HTTPS endpoint, choose its event subscriptions, and verify ownership.",
    Icon: GitBranchIcon,
  },
  {
    number: "02",
    title: "Publish. Then get back to building.",
    text: "Send an event through the API. We'll queue a signed webhook for every subscribed endpoint.",
    Icon: CodeIcon,
  },
  {
    number: "03",
    title: "Know what happened next.",
    text: "Follow each delivery, inspect its attempts, and replay an eligible delivery when you need to.",
    Icon: CheckCircleIcon,
  },
];

export function LandingPage() {
  return (
    <div className="marketing-page">
      <header className="site-header page-width">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#quickstart">Quickstart</a>
        </nav>
        <div className="header-actions">
          <ThemeSwitcher />
          <Link href="/sign-in" className="header-sign-in">
            Sign in
          </Link>
          <Link href="/sign-up" className="button button-small button-primary">
            Start building
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
              OUTBOUND WEBHOOKS, TAKEN CARE OF
            </div>
            <h1>
              Ship the event.
              <br />
              We&apos;ll take it
              <br />
              <span>from here.</span>
            </h1>
            <p className="hero-description">
              Your app has news. Make sure it arrives. Reliable delivery, signed
              requests, and a clear view of every attempt.
            </p>
            <div className="hero-actions">
              <Link href="/sign-up" className="button button-primary">
                Start building
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className="button button-quiet">
                See how it works
                <ArrowDownIcon size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="hero-footnote">
              <span className="mini-rule" />
              Less delivery infrastructure. More of your product.
            </p>
          </div>
          <DeliveryExample />
        </section>

        <section
          id="product"
          className="principles-strip page-width"
          aria-label="Built into every delivery"
        >
          <span className="principles-label">A dependable last mile.</span>
          <span>
            <ShieldCheckIcon size={18} aria-hidden="true" />
            Signed requests
          </span>
          <span>
            <ArrowsClockwiseIcon size={18} aria-hidden="true" />
            Automatic retries
          </span>
          <span>
            <TerminalWindowIcon size={18} aria-hidden="true" />
            Attempt history
          </span>
        </section>

        <section
          id="how-it-works"
          className="how-section page-width section-space"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">A SHORT PATH FROM HERE TO THERE</span>
              <h2>
                Three steps.
                <br />
                One less thing to maintain.
              </h2>
            </div>
            <p>
              From your first event to the attempts that follow, the whole
              journey stays in view.
            </p>
          </div>
          <div className="steps-grid">
            {steps.map(({ number, title, text, Icon }) => (
              <article className="step" key={number}>
                <div className="step-top">
                  <span className="mono">{number}</span>
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="quickstart" className="integration-section">
          <div className="page-width integration-grid">
            <div className="integration-copy">
              <span className="eyebrow">
                A SMALL REQUEST. A SOLID FOUNDATION.
              </span>
              <h2>
                Fits right into
                <br />
                what you&apos;re building.
              </h2>
              <p>
                A straightforward HTTP API. Your event type, your payload, your
                endpoints. No new workflow to learn.
              </p>
              <ul className="integration-details">
                <li>
                  <span>01</span>Set up a verified endpoint
                </li>
                <li>
                  <span>02</span>Create a project API key
                </li>
                <li>
                  <span>03</span>Publish your first event
                </li>
              </ul>
              <Link href="/sign-up" className="text-link text-accent">
                Make your first connection
                <ArrowUpRightIcon size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="code-example">
              <div className="code-example-header">
                <span>
                  <TerminalWindowIcon size={17} aria-hidden="true" />
                  Publish an event
                </span>
                <CopyButton
                  value={publicationExample}
                  label="Copy cURL"
                  successMessage="Example copied. Replace the API host and project key before running it."
                />
              </div>
              <pre>
                <code>{publicationExample}</code>
              </pre>
              <div className="code-example-footer">
                <span className="status status-success">202 Accepted</span>
                <span>Queued for subscribed endpoints.</span>
              </div>
              <p className="code-example-note">
                Example request and response. Use your API host and project key.
              </p>
            </div>
          </div>
        </section>

        <section className="closing-section page-width">
          <span className="eyebrow">
            BUILD YOUR PRODUCT. WE&apos;LL CARRY THE MESSAGE.
          </span>
          <h2>
            Good things deserve
            <br />
            to get delivered.
          </h2>
          <Link href="/sign-up" className="button button-primary">
            Start building with Cascadehook
            <ArrowRightIcon size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="site-footer page-width">
        <div>
          <Brand />
          <p>Webhooks, delivered.</p>
        </div>
        <div className="footer-links">
          <a href="#quickstart">
            Quickstart
            <ArrowUpRightIcon size={14} aria-hidden="true" />
          </a>
          <Link href="/sign-in">Sign in</Link>
          <ThemeSwitcher />
        </div>
      </footer>
    </div>
  );
}
