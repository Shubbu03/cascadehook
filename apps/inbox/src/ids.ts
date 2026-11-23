const base32 = "abcdefghijklmnopqrstuvwxyz234567";

export const inboxIdPattern = /^[a-z2-7]{26}$/;

// 16 random bytes (128 bits) as 26 lowercase base32 characters.
export function newInboxId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += base32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += base32[(value << (5 - bits)) & 31];
  return out;
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function hashToken(token: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}

export function sameHash(a: ArrayBuffer, b: ArrayBuffer) {
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
