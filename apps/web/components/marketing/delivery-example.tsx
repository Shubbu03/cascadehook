import { storyAttempts, storyDelivery, storyEvent } from "@/features/marketing/story";

export function DeliveryExample() {
  return (
    <figure className="relative min-w-0 rounded-2xl bg-surface p-6.5 border border-solid border-border max-[68.75rem]:p-5.5 max-[53.125rem]:w-full max-[53.125rem]:max-w-145 max-[53.125rem]:justify-self-center max-[37.5rem]:rounded-xl max-[37.5rem]:py-4.5 max-[37.5rem]:px-4" data-motion="reveal">
      <figcaption className="flex items-center justify-between flex-wrap pb-5.5 text-muted text-[11px] gap-3 [&_code]:text-foreground [&_code]:text-[11px] [&_code]:wrap-anywhere [&_code_span]:text-muted [&_code_span]:mx-1.25">
        <code>{storyEvent.type} <span aria-hidden="true">→</span> {storyDelivery.path}</code>
        <span>Example delivery</span>
      </figcaption>
      <ol className={"list-none m-0 p-0 [&_li]:grid [&_li]:grid-cols-[7px_auto_minmax(0,1fr)_auto] [&_li]:items-center [&_li]:min-h-13.5 [&_li]:border-t [&_li]:[border-top-style:dashed] [&_li]:border-t-border [&_li]:text-muted [&_li]:text-[12px] [&_li]:gap-3 [&_code]:text-foreground [&_code]:text-[11px] [&_code]:wrap-anywhere max-[68.75rem]:[&_li]:gap-2 max-[37.5rem]:[&_li]:grid-cols-[6px_auto_minmax(0,1fr)_auto] max-[37.5rem]:[&_li]:text-[11px] max-[37.5rem]:[&_li]:gap-1.75 max-[37.5rem]:[&_code]:text-[11px]"} aria-label="Example delivery attempts">
        {storyAttempts.map((attempt, index) => {
          const delivered = attempt.status < 300;
          return (
            <li key={attempt.at}>
              <span className={`rounded-full size-1.75 max-[37.5rem]:size-1.5 ${delivered ? "bg-success" : "bg-danger"}`} aria-hidden="true" />
              <span>Attempt {index + 1}</span>
              <code className={delivered ? "text-success!" : undefined}>{attempt.status} {attempt.label}</code>
              <span className="font-mono text-[11px] text-right whitespace-nowrap max-[37.5rem]:text-[11px]">{attempt.duration} ms</span>
            </li>
          );
        })}
      </ol>
      <div className="pt-5.75 border-t border-t-border max-[37.5rem]:pt-4.5 [&_p]:text-[17px] [&_p]:leading-normal [&_p]:tracking-tight [&_>_span]:block [&_>_span]:mt-1.25 [&_>_span]:text-muted [&_>_span]:text-[11px] max-[37.5rem]:[&_p]:text-[16px]">
        <p>Delivered on attempt {storyAttempts.length}.</p>
        <span>Scroll down to follow this event from publish to delivered.</span>
      </div>
      <span data-cascade-node="start" aria-hidden="true" className="absolute bottom-0 left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-solid border-accent bg-background" />
    </figure>
  );
}
