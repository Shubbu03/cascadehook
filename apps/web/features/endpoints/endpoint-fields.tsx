type FieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
  form?: string;
  hideLabel?: boolean;
};

export function EndpointDestinationField({
  id,
  value,
  onChange,
  error,
  disabled,
  form,
  hideLabel,
}: FieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        Destination URL
      </label>
      <input
        id={id}
        form={form}
        type="url"
        name="url"
        placeholder="https://your-app.com/webhooks"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={id + "-help"}
      />
      <p id={id + "-help"} className={error ? "form-error" : "field-help"}>
        {error ?? "Use a public HTTPS receiver. Private addresses and redirects aren't supported."}
      </p>
    </div>
  );
}

export function EndpointSubscriptionsField({
  id,
  value,
  onChange,
  error,
  disabled,
  form,
  hideLabel,
}: FieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        Event subscriptions
      </label>
      <textarea
        id={id}
        form={form}
        name="event_types"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"invoice.paid\nsubscription.updated"}
        rows={3}
        required
        disabled={disabled}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={id + "-help"}
      />
      <p id={id + "-help"} className={error ? "form-error" : "field-help"}>
        {error ?? "One event type per line, or separate them with commas. Exact matches only; wildcards aren't supported."}
      </p>
    </div>
  );
}
