import type { ReactNode } from "react";
import { storyEndpoints, storyEvent, type StoryEndpoint } from "@/features/marketing/story";

export const storyCard =
  "min-w-0 rounded-2xl border border-solid border-border bg-surface transition-[border-color,box-shadow] duration-500 hover:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] group-data-[active=true]/chapter:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_22%,transparent),0_24px_60px_-34px_color-mix(in_srgb,var(--accent)_55%,transparent)]";

const rowHeight = 64;
const rowGap = 12;
const width = 280;
const cycle = 2.8;

// Full class names per branch so Tailwind can see them; hovering a row dims every branch except its own.
const branchHover = [
  "group-has-[[data-endpoint=e0]:hover]/fan:opacity-100 group-has-[[data-endpoint=e0]:hover]/fan:stroke-[3]",
  "group-has-[[data-endpoint=e1]:hover]/fan:opacity-100 group-has-[[data-endpoint=e1]:hover]/fan:stroke-[3]",
  "group-has-[[data-endpoint=e2]:hover]/fan:opacity-100 group-has-[[data-endpoint=e2]:hover]/fan:stroke-[3]",
  "group-has-[[data-endpoint=e3]:hover]/fan:opacity-100 group-has-[[data-endpoint=e3]:hover]/fan:stroke-[3]",
  "group-has-[[data-endpoint=e4]:hover]/fan:opacity-100 group-has-[[data-endpoint=e4]:hover]/fan:stroke-[3]",
  "group-has-[[data-endpoint=e5]:hover]/fan:opacity-100 group-has-[[data-endpoint=e5]:hover]/fan:stroke-[3]",
];

export function FanOut({ caption, endpoints = storyEndpoints }: { caption: ReactNode; endpoints?: StoryEndpoint[] }) {
  const height = endpoints.length * rowHeight + (endpoints.length - 1) * rowGap;
  const centre = height / 2;
  return (
    <figure className={`group/fan p-7 max-[53.125rem]:p-5.5 max-[37.5rem]:p-4 ${storyCard}`} data-motion="reveal">
      <div className="grid grid-cols-[minmax(0,15rem)_minmax(3rem,1fr)_minmax(0,2fr)] items-center max-[53.125rem]:grid-cols-[minmax(0,1fr)]">
        <div className="rounded-xl border border-solid border-border bg-background px-4.5 py-4">
          <p className="text-muted text-[11px]">Published once</p>
          <code className="mt-1.5 block text-[14px]">{storyEvent.type}</code>
          <code className="mt-1 block truncate text-muted text-[11px]">{storyEvent.id}</code>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full overflow-visible max-[53.125rem]:hidden" aria-hidden="true">
          {endpoints.map((endpoint, index) => {
            const y = rowHeight / 2 + index * (rowHeight + rowGap);
            const d = `M0 ${centre} C${width * 0.55} ${centre} ${width * 0.45} ${y} ${width} ${y}`;
            const delivered = endpoint.status < 300;
            const begin = `${index * 0.22}s`;
            return (
              <g key={endpoint.url}>
                <path d={d} pathLength={1} strokeDasharray="1" fill="none" strokeWidth={1.5}
                  className={`${delivered ? "stroke-success" : "stroke-danger"} transition-[opacity,stroke-width] duration-200 group-has-[li:hover]/fan:opacity-25 ${branchHover[index] ?? ""} motion-safe:group-data-[visible=true]/fan:animate-cascade-path`}
                  style={{ animationDelay: `${150 + index * 120}ms` }} />
                <circle r={4} className={`motion-reduce:hidden ${delivered ? "fill-success" : "fill-danger"}`} opacity={0}>
                  <animateMotion dur={`${cycle}s`} begin={begin} repeatCount="indefinite" path={d} calcMode="linear"
                    keyPoints={delivered ? "0;1;1" : "0;1;0.78;0.78"} keyTimes={delivered ? "0;0.55;1" : "0;0.55;0.7;1"} />
                  <animate attributeName="opacity" dur={`${cycle}s`} begin={begin} repeatCount="indefinite"
                    values="0;1;1;0;0" keyTimes={delivered ? "0;0.08;0.55;0.62;1" : "0;0.08;0.62;0.72;1"} />
                </circle>
              </g>
            );
          })}
        </svg>
        <ul className="grid list-none gap-3 m-0 p-0 max-[53.125rem]:mt-3 max-[53.125rem]:ml-4 max-[53.125rem]:border-l max-[53.125rem]:border-dashed max-[53.125rem]:border-border max-[53.125rem]:pt-3 max-[53.125rem]:pl-4">
          {endpoints.map((endpoint, index) => {
            const delivered = endpoint.status < 300;
            return (
              <li key={endpoint.url} data-endpoint={`e${index}`}
                className="grid h-16 cursor-default grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-xl border border-solid border-border bg-surface px-4 transition-[border-color,transform] duration-200 hover:-translate-x-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] max-[53.125rem]:h-auto max-[53.125rem]:py-3 max-[37.5rem]:gap-2.5 max-[37.5rem]:px-3 motion-reduce:hover:translate-x-0">
                <span className={`size-1.75 rounded-full motion-safe:animate-endpoint-arrive ${delivered ? "bg-success text-success" : "bg-danger text-danger"}`}
                  style={{ animationDelay: `${index * 0.22}s` }} aria-hidden="true" />
                <span className="min-w-0">
                  <code className="block truncate text-[12px] max-[37.5rem]:text-[11px]">{endpoint.url}</code>
                  <span className="block text-muted text-[11px]">{endpoint.owner}</span>
                </span>
                <span className="text-right font-mono text-[11px] whitespace-nowrap">
                  <span className={`block ${delivered ? "text-success" : "text-danger"}`}>{endpoint.status} {endpoint.label}</span>
                  <span className="block text-muted">{endpoint.duration} ms</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <figcaption className="mt-6 border-t border-dashed border-border pt-4.5 text-muted text-[12px] leading-[1.7] [&_code]:text-foreground [&_code]:text-[11px] max-[37.5rem]:mt-5 max-[37.5rem]:pt-4">{caption}</figcaption>
    </figure>
  );
}
