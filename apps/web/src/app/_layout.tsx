import '@/global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { IntlProvider } from 'use-intl';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PushRegistration } from '@/components/PushRegistration';
import { AppLocaleProvider, useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { GameSettingsProvider } from '@/lib/game-settings-context';

SplashScreen.preventAutoHideAsync();

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
        <IntlBridge>
          <AnimatedSplashOverlay />
          <PushRegistration />
          <Stack screenOptions={{ headerShown: false }} />
        </IntlBridge>
      </GameSettingsProvider>
    </AppLocaleProvider>
  );
}
