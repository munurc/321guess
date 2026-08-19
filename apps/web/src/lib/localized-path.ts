import { Platform } from "react-native";

/** Prefixes a base in-app path ("/manual", "/", "/online" …) with "/en" when
 * the current locale is English — the same URL family as the crawlable
 * "/en" route tree in src/app/en/. Used so in-app navigation (mode cards,
 * back buttons, cross-links) stays inside the current locale's URL family
 * on web. `locale` takes a plain string (call sites mostly get it from
 * use-intl's `useLocale()`, which isn't typed as the narrower AppLocale)
 * since only equality with "en" is ever checked.
 *
 * Native-safe by construction: native has no "/en" screens and its locale
 * comes from a persisted Settings preference rather than the URL, so this
 * is a hard no-op there regardless of which locale is active — Platform.OS
 * is checked here once, so every call site gets that safety for free. */
export function localizedPath(base: string, locale: string): string {
  if (Platform.OS !== "web" || locale !== "en") return base;
  return base === "/" ? "/en" : `/en${base}`;
}
