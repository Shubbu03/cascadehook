const timestamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return timestamp.format(new Date(value)) + " UTC";
}

export function formatBytes(value: number) {
  if (value < 1024) return value.toLocaleString("en-US") + " B";
  const unit = value < 1024 ** 2 ? 1 : value < 1024 ** 3 ? 2 : 3;
  return (
    (value / 1024 ** unit).toFixed(1) + " " + ["B", "KiB", "MiB", "GiB"][unit]
  );
}

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
