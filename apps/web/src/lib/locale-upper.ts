/** Locale-aware uppercasing for UI labels styled as all-caps.
 *
 * React Native's `textTransform: 'uppercase'` (the NativeWind `uppercase`
 * class) uses a locale-independent case mapping on iOS, so Turkish "i"
 * becomes the dotless "I" instead of the correct dotted "İ" (e.g. "dahil"
 * -> "DAHIL" instead of "DAHİL"). Callers should pre-uppercase text with
 * this helper and drop the `uppercase` CSS class rather than relying on
 * the CSS transform.
 *
 * Doesn't delegate to `String.toLocaleUpperCase` — Hermes (RN's JS engine)
 * isn't guaranteed to ship with full ICU locale data, and per spec an
 * engine without it is allowed to silently ignore the locale argument and
 * fall back to the same non-Turkish mapping this function exists to fix.
 * The Turkish "i" -> "İ" substitution is applied by hand first (every
 * other Turkish letter, including dotless "ı" -> "I", already has an
 * unambiguous mapping under the plain, locale-independent algorithm). */
export function localeUpper(text: string, locale: string): string {
  if (locale === "tr") {
    return text.replace(/i/g, "İ").toUpperCase();
  }
  return text.toLocaleUpperCase(locale);
}
