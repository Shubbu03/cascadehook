import Link from "next/link";

export function Brand({ href = "/dashboard" }: { href?: "/" | "/dashboard" | null }) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        cascadehook<span className="brand-period">.</span>
      </span>
    </>
  );

  if (href === null) return <span className="brand">{content}</span>;

  return (
    <Link
      href={href}
      className="brand"
      aria-label={href === "/dashboard" ? "Cascadehook dashboard" : "Cascadehook home"}
    >
      {content}
    </Link>
  );
}
