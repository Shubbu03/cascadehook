export type NameActionState = { error: string | null };

export function setupName(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && [...name].length <= 100 && !/\p{Cc}/u.test(name)
    ? name
    : null;
}
