const attempts = [
  { status: 503, label: "Unavailable", duration: 120 },
  { status: 503, label: "Unavailable", duration: 98 },
  { status: 200, label: "OK", duration: 84 },
];

export function DeliveryExample() {
  return (
    <figure className="min-w-0 rounded-2xl bg-surface p-6.5 border border-solid border-border max-[68.75rem]:p-5.5 max-[53.125rem]:w-full max-[53.125rem]:max-w-145 max-[53.125rem]:justify-self-center max-[37.5rem]:rounded-xl max-[37.5rem]:py-4.5 max-[37.5rem]:px-4" data-motion="reveal">
      <figcaption className="flex items-center justify-between flex-wrap pb-5.5 text-muted text-[11px] gap-3 [&_code]:text-foreground [&_code]:text-[11px] [&_code]:wrap-anywhere [&_code_span]:text-muted [&_code_span]:mx-1.25">
        <code>invoice.paid <span aria-hidden="true">→</span> /webhooks/billing</code>
        <span>Example delivery</span>
      </figcaption>
      <ol className={"list-none m-0 p-0 [&_li]:grid [&_li]:grid-cols-[7px_auto_minmax(0,1fr)_auto] [&_li]:items-center [&_li]:min-h-13.5 [&_li]:border-t [&_li]:[border-top-style:dashed] [&_li]:border-t-border [&_li]:text-muted [&_li]:text-[12px] [&_li]:gap-3 [&_code]:text-foreground [&_code]:text-[11px] [&_code]:wrap-anywhere max-[68.75rem]:[&_li]:gap-2 max-[37.5rem]:[&_li]:grid-cols-[6px_auto_minmax(0,1fr)_auto] max-[37.5rem]:[&_li]:text-[11px] max-[37.5rem]:[&_li]:gap-1.75 max-[37.5rem]:[&_code]:text-[11px] [&_[data-outcome=\"success\"]_code]:text-success"} aria-label="Example delivery attempts">
        {attempts.map((attempt, index) => (
          <li key={index} data-outcome={attempt.status === 200 ? "success" : "failed"}>
            <span className={"rounded-full bg-input-border size-1.75 max-[37.5rem]:size-1.5 [[data-outcome=\"success\"]_>_&]:bg-success [[data-outcome=\"failed\"]_>_&]:bg-danger"} aria-hidden="true" />
            <span>Attempt {index + 1}</span>
            <code>{attempt.status} {attempt.label}</code>
            <span className="font-mono text-[11px] text-right whitespace-nowrap max-[37.5rem]:text-[11px]">{attempt.duration} ms</span>
          </li>
        ))}
      </ol>
      <div className="pt-5.75 border-t border-t-border max-[37.5rem]:pt-4.5 [&_p]:text-[17px] [&_p]:leading-normal [&_p]:tracking-tight [&_>_span]:block [&_>_span]:mt-1.25 [&_>_span]:text-muted [&_>_span]:text-[11px] max-[37.5rem]:[&_p]:text-[16px]">
        <p>Delivered on attempt 3.</p>
        <span>HMAC-signed requests · Every attempt recorded</span>
      </div>
    </figure>
  );
}
