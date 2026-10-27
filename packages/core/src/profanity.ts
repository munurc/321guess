// Username moderation for online mode: format rules + a TR/EN profanity
// blocklist. This is intentionally a starting list, not exhaustive — extend
// BLOCKED_TR / BLOCKED_EN as new evasions show up in the wild.

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const LEET_MAP: Record<string, string> = {
  "4": "a",
  "3": "e",
  "1": "i",
  "0": "o",
  "@": "a",
  $: "s",
};

/** Lowercase, strip diacritics/punctuation, and collapse common leetspeak so "4mk" and "amk" both hit the blocklist. */
function normalizeForFilter(s: string): string {
  const stripped = stripDiacritics(s).toLowerCase();
  let out = "";
  for (const ch of stripped) out += LEET_MAP[ch] ?? ch;
  return out.replace(/[^a-z0-9]/g, "");
}

const BLOCKED_TR = [
  "amk",
  "amq",
  "aq",
  "orospu",
  "orospucocugu",
  "piç",
  "pic",
  "yavşak",
  "yavsak",
  "siktir",
  "sikik",
  "sikeyim",
  "göt",
  "got",
  "götveren",
  "gotveren",
  "ibne",
  "top",
  "kahpe",
  "şerefsiz",
  "serefsiz",
  "puşt",
  "pust",
  "mal",
  "salak",
  "gerizekalı",
  "gerizekali",
  "yarrak",
  "yarak",
  "sik",
  "amcık",
  "amcik",
];

const BLOCKED_EN = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "whore",
  "slut",
  "dick",
  "pussy",
  "bastard",
  "rape",
  "nazi",
  "hitler",
];

// Religious terms that read as disrespectful in a joke/game handle.
const BLOCKED_RELIGIOUS = ["allah"];

const RESERVED = ["admin", "administrator", "moderator", "mod", "321guess", "system", "support", "official", "staff"];

const BLOCKLIST = [...BLOCKED_TR, ...BLOCKED_EN, ...BLOCKED_RELIGIOUS, ...RESERVED]
  .map(normalizeForFilter)
  .filter((w) => w.length > 0);

export function containsBlockedWord(username: string): boolean {
  const normalized = normalizeForFilter(username);
  if (!normalized) return false;
  return BLOCKLIST.some((word) => normalized.includes(word));
}

// 3–20 chars, must start with a letter (Unicode, so Turkish ı/ğ/ş/ç/ö/ü are
// allowed), then letters/digits/underscore. Consecutive underscores are
// rejected separately below.
const USERNAME_FORMAT_RE = /^\p{L}[\p{L}\p{N}_]{2,19}$/u;

// Any character repeated 3+ times in a row ("aaaaaa", "bbbb", "1111") reads
// as keyboard-mash spam rather than a real handle — reject at the format
// stage instead of growing the profanity blocklist for this.
const REPEATED_CHAR_RE = /(.)\1{2,}/iu;

export type UsernameValidation =
  | { valid: true }
  | { valid: false; reason: "format" | "blocked" };

export function validateUsername(username: string): UsernameValidation {
  if (!USERNAME_FORMAT_RE.test(username) || username.includes("__") || REPEATED_CHAR_RE.test(username)) {
    return { valid: false, reason: "format" };
  }
  if (containsBlockedWord(username)) {
    return { valid: false, reason: "blocked" };
  }
  return { valid: true };
}
