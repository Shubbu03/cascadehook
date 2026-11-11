
import { Input, Textarea } from "@/components/input";
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
    <div className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='endpoint-inline-fields']:mb-0 in-data-[ui~='endpoint-registration-dialog']:mb-4.5 [[data-ui~='endpoint-registration-dialog']_&_p]:text-[12px] [[data-ui~='endpoint-registration-dialog']_&_p]:leading-[1.7] [[data-ui~='endpoint-registration-dialog']_&_p]:m-0">
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        Destination URL
      </label>
      <Input className="in-data-[ui~='workspace-create-dialog']:bg-surface-hover in-data-[ui~='workspace-create-dialog']:border-0 in-data-[ui~='workspace-create-dialog']:border-none in-data-[ui~='workspace-create-dialog']:border-current in-data-[ui~='dashboard-main']:min-h-10 in-data-[ui~='dashboard-main']:text-[14px] in-data-[ui~='dashboard-main']:py-2.25 in-data-[ui~='dashboard-main']:px-3 in-data-[ui~='workspace-create-dialog']:focus-visible:outline-hidden in-data-[ui~='workspace-create-dialog']:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
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
      <p id={id + "-help"} className={(error) ? "text-danger text-[13px] my-3 in-data-[ui~='endpoint-form']:my-0 [[data-ui~='endpoint-form']_>_&]:my-4 in-data-[ui~='endpoint-registration-dialog']:text-danger" : "text-[12px] text-muted leading-[1.7] in-data-[ui~='endpoint-registration-dialog']:text-muted in-data-[ui~='endpoint-registration-dialog']:text-[12px] in-data-[ui~='endpoint-registration-dialog']:leading-[1.7]"}>
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
    <div className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='endpoint-inline-fields']:mb-0 in-data-[ui~='endpoint-registration-dialog']:mb-4.5 [[data-ui~='endpoint-registration-dialog']_&_p]:text-[12px] [[data-ui~='endpoint-registration-dialog']_&_p]:leading-[1.7] [[data-ui~='endpoint-registration-dialog']_&_p]:m-0">
      <label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        Event subscriptions
      </label>
      <Textarea className="w-full resize-y min-h-32.5 rounded-md text-foreground font-normal text-[14px] leading-[1.7] font-mono p-3 max-[32.5rem]:text-[16px]"
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
      <p id={id + "-help"} className={(error) ? "text-danger text-[13px] my-3 in-data-[ui~='endpoint-form']:my-0 [[data-ui~='endpoint-form']_>_&]:my-4 in-data-[ui~='endpoint-registration-dialog']:text-danger" : "text-[12px] text-muted leading-[1.7] in-data-[ui~='endpoint-registration-dialog']:text-muted in-data-[ui~='endpoint-registration-dialog']:text-[12px] in-data-[ui~='endpoint-registration-dialog']:leading-[1.7]"}>
        {error ?? "One event type per line, or separate them with commas. Exact matches only; wildcards aren't supported."}
      </p>
    </div>
  );
}
