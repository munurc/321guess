import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { IntlProvider } from 'use-intl';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppLocaleProvider, useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';

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
  const colorScheme = useColorScheme();
  return (
    <AppLocaleProvider>
      <IntlBridge>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </IntlBridge>
    </AppLocaleProvider>
  );
}
