import Link from "next/link";

export default function NotFound() {
  return (
    <main className="docs-not-found">
      <p className="docs-eyebrow">404 / Page not found</p>
      <h1>Let’s get you back on track.</h1>
      <p>This documentation page may have moved. Browse the guides or search for what you need.</p>
      <Link href="/docs">Browse documentation →</Link>
    </main>
  );
}
