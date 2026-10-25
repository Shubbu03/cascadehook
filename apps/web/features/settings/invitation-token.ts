export function invitationToken(value: string) {
  const input = value.trim();
  let token = input;
  if (!input.startsWith("chi_")) {
    try {
      token =
        new URLSearchParams(new URL(input).hash.slice(1)).get("token") ?? "";
    } catch {
      return null;
    }
  }
  return /^chi_[a-f0-9]{64}$/.test(token) ? token : null;
}
