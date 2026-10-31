const attempts = [
  { status: 503, label: "Unavailable", duration: 120 },
  { status: 503, label: "Unavailable", duration: 98 },
  { status: 200, label: "OK", duration: 84 },
];

export function DeliveryExample() {
  return (
    <figure className="landing-delivery-example" data-motion="reveal">
      <figcaption className="landing-delivery-caption">
        <code>invoice.paid <span aria-hidden="true">→</span> /webhooks/billing</code>
        <span>Example delivery</span>
      </figcaption>
      <ol className="landing-delivery-attempts" aria-label="Example delivery attempts">
        {attempts.map((attempt, index) => (
          <li key={index} data-outcome={attempt.status === 200 ? "success" : "failed"}>
            <span className="landing-delivery-dot" aria-hidden="true" />
            <span>Attempt {index + 1}</span>
            <code>{attempt.status} {attempt.label}</code>
            <span className="landing-delivery-duration">{attempt.duration} ms</span>
          </li>
        ))}
      </ol>
      <div className="landing-delivery-result">
        <p>Delivered on attempt 3.</p>
        <span>HMAC-signed requests · Every attempt recorded</span>
      </div>
    </figure>
  );
}
