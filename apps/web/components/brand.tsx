import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Cascadehook home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        cascadehook<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
