// Pure helpers for multi-player challenge invite links. No I/O here — the
// Supabase side lives in challenge-link-db.ts.

export const LINK_CODE_LENGTH = 8;

// Lowercase letters + digits minus the look-alikes 0/o, 1/l/i, so a code
// read aloud or retyped from a screenshot survives.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const defaultRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function generateLinkCode(random: (n: number) => Uint8Array = defaultRandom): string {
  // Rejection sampling keeps every character equally likely (256 isn't a
  // multiple of the alphabet size).
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of random(LINK_CODE_LENGTH)) {
      if (byte < limit && code.length < LINK_CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

export function linkUrl(code: string): string {
  return `https://www.321guess.com/m/${code}`;
}

export type LinkState = { creatorToken: string; expiresAt: string; revokedAt: string | null };

export function isLinkJoinable(
  link: LinkState,
  joinerToken: string,
  now: Date,
): { ok: true } | { ok: false; reason: "revoked" | "expired" | "own_link" } {
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (new Date(link.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (link.creatorToken === joinerToken) return { ok: false, reason: "own_link" };
  return { ok: true };
}
