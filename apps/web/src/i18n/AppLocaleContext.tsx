import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultLocale, type AppLocale } from "./messages";

type AppLocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void };

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);
  return (
    <AppLocaleContext.Provider value={{ locale, setLocale }}>{children}</AppLocaleContext.Provider>
  );
}

/** Produces: { locale: AppLocale, setLocale: (locale: AppLocale) => void }.
 * Consumed by _layout.tsx and LanguageSwitcher. */
export function useAppLocale(): AppLocaleContextValue {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error("useAppLocale must be used within AppLocaleProvider");
  return ctx;
}
