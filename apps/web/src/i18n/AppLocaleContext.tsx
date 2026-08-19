import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";
import { defaultLocale, messages, type AppLocale } from "./messages";

const LOCALE_KEY = "321guess.settings.locale";

type AppLocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void };

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

/** Web only: "/en" is a real, crawlable URL prefix (see src/app/en/), so
 * search engines can index English content directly instead of only ever
 * seeing it behind a client-side toggle. Native has no URL bar and no "/en"
 * screens, so this always resolves to null there. */
function localeFromPath(pathname: string): AppLocale | null {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  return null;
}

function pathWithLocale(pathname: string, locale: AppLocale): string {
  const base = pathname === "/en" ? "/" : pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
  return locale === "en" ? (base === "/" ? "/en" : `/en${base}`) : base;
}

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const urlLocale = Platform.OS === "web" ? localeFromPath(pathname) : null;

  const [storedLocale, setStoredLocale] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY)
      .then((v) => {
        if (v && v in messages) setStoredLocale(v as AppLocale);
      })
      .catch(() => {});
  }, []);

  // On web, a "/en" URL always wins over the stored preference — that's
  // what makes it a genuine, independently-indexable route rather than a
  // client-only toggle. Off "/en", the stored preference (native's only
  // mechanism) still applies exactly as before.
  const locale = urlLocale ?? storedLocale;

  // Web-only: CSS `text-transform: uppercase` only applies Turkish-correct
  // casing (dotted İ, not dotless I) when the page's `lang` matches — Expo's
  // static export never sets this per-locale, so every `uppercase` class
  // silently used English casing rules regardless of the app's language.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: AppLocale) {
    setStoredLocale(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
    // Web only: keep the URL in sync with the chosen language. Native has
    // no "/en" routes at all, so this must never run there — router.replace
    // with a web-shaped path would be meaningless (at best a no-op, at
    // worst a bad native navigation) on a native stack navigator.
    if (Platform.OS === "web") {
      router.replace(pathWithLocale(pathname, next) as never);
    }
  }

  return (
    <AppLocaleContext.Provider value={{ locale, setLocale }}>{children}</AppLocaleContext.Provider>
  );
}

/** Produces: { locale: AppLocale, setLocale: (locale: AppLocale) => void }.
 * Consumed by _layout.tsx and LanguageSwitcher. Persists across launches
 * via AsyncStorage. */
export function useAppLocale(): AppLocaleContextValue {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error("useAppLocale must be used within AppLocaleProvider");
  return ctx;
}
