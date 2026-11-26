import type { ReactNode } from "react";

export const chapterHeading =
  "mt-4 max-w-160 text-[clamp(30px,3.4vw,42px)] font-normal leading-[1.16] tracking-[-0.045em] text-balance max-[37.5rem]:mt-3 max-[37.5rem]:text-[29px] [&_span]:text-accent";
export const chapterCopy =
  "mt-5 max-w-140 text-muted text-[15px] leading-[1.85] max-[37.5rem]:mt-4 max-[37.5rem]:text-[14px] [&_code]:text-foreground [&_code]:text-[13px]";

type Node = "marker" | "dot" | "none";

const sides = {
  left: "grid-cols-[56px_minmax(0,1fr)] max-[53.125rem]:grid-cols-[36px_minmax(0,1fr)]",
  right: "grid-cols-[minmax(0,1fr)_56px] max-[53.125rem]:grid-cols-[minmax(0,1fr)_36px]",
};

// CascadeTrack draws the line through each node and sets data-active once the travelling event reaches it.
export function Chapter({
  id, marker, eyebrow, title, children, visual, node = "marker", side = "left", className = "",
}: {
  id: string;
  marker?: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  visual?: ReactNode;
  node?: Node;
  side?: keyof typeof sides;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId}
      className={`group/chapter relative z-1 grid gap-x-10 max-[68.75rem]:gap-x-7 max-[53.125rem]:gap-x-5 max-[37.5rem]:grid-cols-[24px_minmax(0,1fr)] max-[37.5rem]:gap-x-3.5 ${sides[side]} ${className}`}>
      <div aria-hidden="true" className={side === "right" ? "order-last max-[37.5rem]:order-first" : undefined}>
        {node === "marker" && (
          <span data-cascade-node="" className="relative mx-auto mt-20 flex size-9 items-center justify-center rounded-full border border-solid border-accent bg-background font-mono text-[11px] text-accent transition-[background-color,color,box-shadow] duration-500 group-data-[active=true]/chapter:bg-accent group-data-[active=true]/chapter:text-accent-foreground group-data-[active=true]/chapter:shadow-[0_0_0_6px_color-mix(in_srgb,var(--accent)_18%,transparent)] max-[53.125rem]:mt-16 max-[53.125rem]:size-8 max-[37.5rem]:mt-10 max-[37.5rem]:size-6 max-[37.5rem]:text-[10px]">
            {marker}
          </span>
        )}
        {node === "dot" && (
          <span data-cascade-node="" className="relative mx-auto mt-[93px] block size-2.5 rounded-full border-2 border-solid border-accent bg-background transition-colors duration-500 group-data-[active=true]/chapter:bg-accent max-[53.125rem]:mt-[75px] max-[37.5rem]:mt-12 max-[37.5rem]:size-2" />
        )}
      </div>
      <div className="min-w-0 py-20 max-[53.125rem]:py-16 max-[37.5rem]:py-10">
        {eyebrow && <p data-ui="landing-eyebrow" className="text-accent text-[13px] leading-[1.6] min-h-9 flex items-center max-[53.125rem]:min-h-8 max-[37.5rem]:min-h-6">{eyebrow}</p>}
        <h2 id={headingId} className={chapterHeading}>{title}</h2>
        {children}
        {visual && <div className="mt-10 max-[37.5rem]:mt-7">{visual}</div>}
      </div>
    </section>
  );
}
