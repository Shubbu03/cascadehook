import type { BillingInterval } from "@/lib/plans";

const intervals = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Yearly · 2 months free" },
] as const;

export function BillingIntervalPicker({
  interval,
  onChange,
}: {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  return (
    <fieldset className="mt-6 mb-8 flex w-fit flex-wrap gap-1 rounded-lg border border-border p-1">
      <legend className="sr-only">Billing interval</legend>
      {intervals.map(({ value, label }) => (
        <label key={value} className="relative cursor-pointer">
          <input
            type="radio"
            name="billing-interval"
            value={value}
            checked={interval === value}
            onChange={() => onChange(value)}
            className="peer sr-only"
          />
          <span className="block rounded-sm px-3.5 py-2.25 text-[13px] text-muted peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent">
            {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
