import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultLocale, messages, type AppLocale } from "./messages";

const LOCALE_KEY = "321guess.settings.locale";

type AppLocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void };

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY)
      .then((v) => {
        if (v && v in messages) setLocaleState(v as AppLocale);
      })
      .catch(() => {});
  }, []);

  function setLocale(next: AppLocale) {
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
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
