import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CONSENT_KEY = "321guess.settings.analyticsConsent";
export const GA_MEASUREMENT_ID = "G-PW8MGE4D96";

type Consent = "unset" | "granted" | "denied";

type Ctx = { consent: Consent; setConsent: (v: "granted" | "denied") => void };

const AnalyticsConsentContext = createContext<Ctx | null>(null);

function gtag(...args: unknown[]) {
  const fn = (window as { gtag?: (...a: unknown[]) => void }).gtag;
  fn?.(...args);
}

/** GA's script (loaded unconditionally in +html.tsx) only defines the
 * `gtag` function — it never calls `config` there, so no analytics
 * cookie is set until the user grants consent here. */
function initGA() {
  if (Platform.OS !== "web") return;
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

export function AnalyticsConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsentState] = useState<Consent>("unset");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    AsyncStorage.getItem(CONSENT_KEY)
      .then((v) => {
        if (v === "granted" || v === "denied") {
          setConsentState(v);
          if (v === "granted") initGA();
        }
      })
      .catch(() => {});
  }, []);

  function setConsent(v: "granted" | "denied") {
    setConsentState(v);
    AsyncStorage.setItem(CONSENT_KEY, v).catch(() => {});
    if (v === "granted") initGA();
  }

  return (
    <AnalyticsConsentContext.Provider value={{ consent, setConsent }}>
      {children}
    </AnalyticsConsentContext.Provider>
  );
}

/** Produces: { consent: 'unset'|'granted'|'denied', setConsent }. Consumed
 * by CookieConsent (shows the banner + records the choice) and
 * AnalyticsPageview in _layout.tsx (only fires page_view once granted). */
export function useAnalyticsConsent(): Ctx {
  const ctx = useContext(AnalyticsConsentContext);
  if (!ctx) throw new Error("useAnalyticsConsent must be used within AnalyticsConsentProvider");
  return ctx;
}

export function sendPageview(path: string) {
  gtag("event", "page_view", { page_path: path });
}
