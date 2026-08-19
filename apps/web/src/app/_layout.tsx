import '@/global.css';

import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { colorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IntlProvider } from 'use-intl';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { CookieConsent } from '@/components/CookieConsent';
import { PushRegistration } from '@/components/PushRegistration';
import { THEME_KEY } from '@/components/ThemeToggle';
import { AppLocaleProvider, useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { AnalyticsConsentProvider, sendPageview, useAnalyticsConsent } from '@/lib/analytics-consent';
import { GameSettingsProvider } from '@/lib/game-settings-context';

SplashScreen.preventAutoHideAsync();

/** NativeWind's web colorScheme is in-memory only — it never persisted the
 * user's toggle choice, so every reload silently fell back to the system
 * preference. Restore whatever ThemeToggle last saved. */
function ThemePersistence() {
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (v === 'dark' || v === 'light') colorScheme.set(v);
      })
      .catch(() => {});
  }, []);
  return null;
}

/** Fires a page_view on every route change (this is a single-page app, so
 * there's no full reload to trigger GA's own automatic pageview) — but
 * only once the user has granted analytics consent. */
function AnalyticsPageview() {
  const pathname = usePathname();
  const { consent } = useAnalyticsConsent();
  useEffect(() => {
    if (Platform.OS !== 'web' || consent !== 'granted') return;
    sendPageview(pathname);
  }, [pathname, consent]);
  return null;
}

function IntlBridge({ children }: { children: ReactNode }) {
  const { locale } = useAppLocale();
  return (
    <IntlProvider locale={locale} messages={messages[locale]} timeZone="Europe/Istanbul">
      {children}
    </IntlProvider>
  );
}

export default function TabLayout() {
  return (
    <AppLocaleProvider>
      <GameSettingsProvider>
        <AnalyticsConsentProvider>
          <IntlBridge>
            <ThemePersistence />
            <AnalyticsPageview />
            <AnimatedSplashOverlay />
            <PushRegistration />
            <Stack screenOptions={{ headerShown: false }} />
            <CookieConsent />
          </IntlBridge>
        </AnalyticsConsentProvider>
      </GameSettingsProvider>
    </AppLocaleProvider>
  );
}
