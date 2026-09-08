import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { ArenaBackground } from './ArenaBackground';
import { ArenaPressable } from './ArenaPressable';
import { BottomTabBar } from './BottomTabBar';
import { useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { isAppleSignInAvailable, sendMagicLink, signInWithApple, signInWithGoogle } from '../lib/account-auth';
import { linkAccount } from '../lib/account-api';
import { loadIdentity } from '../lib/online-storage';
import { getSupabaseClient } from '../lib/supabase-client';
import { useGameSettings } from '@/lib/game-settings-context';
import { localeUpper } from '@/lib/locale-upper';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const tLang = useTranslations('language');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useAppLocale();
  const { soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled } = useGameSettings();
  const locales = Object.keys(messages) as (keyof typeof messages)[];

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'linked' | 'emailSent' | 'failed'>('idle');

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function completeLink(result: { accessToken: string } | null) {
    if (!result) {
      setLinkStatus('failed');
      return;
    }
    const identity = await loadIdentity();
    if (!identity) {
      setLinkStatus('failed');
      return;
    }
    const ok = await linkAccount(identity.token, result.accessToken);
    setLinkStatus(ok ? 'linked' : 'failed');
  }

  async function handleGoogleLink() {
    await completeLink(await signInWithGoogle());
  }

  async function handleAppleLink() {
    await completeLink(await signInWithApple());
  }

  useEffect(() => {
    if (linkStatus !== 'emailSent') return;
    // Sync (non-async) callback intentionally: onAuthStateChange's async-callback
    // overload is documented as deprecated in the installed @supabase/auth-js
    // types (GoTrueClient.d.ts) because an awaited callback can deadlock a
    // TOKEN_REFRESHED notification against a nested refresh — completeLink()
    // calls loadIdentity(), which can call supabase.auth.getSession() and
    // trigger exactly that nested refresh. Firing completeLink without
    // awaiting it inside the callback keeps this on the non-deprecated sync
    // overload and lets _notifyAllSubscribers return before that work runs.
    const { data: subscription } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      void completeLink({ accessToken: session.access_token });
    });
    return () => subscription.subscription.unsubscribe();
  }, [linkStatus]);

  async function handleEmailLink() {
    if (!email.trim()) return;
    const sent = await sendMagicLink(email.trim());
    setLinkStatus(sent ? 'emailSent' : 'failed');
  }

  return (
    <ArenaBackground className="flex-1">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: insets.top + 32 }}>
      <ArenaPressable onPress={() => router.back()}>
        <Text className="text-xs tracking-wider text-arena-text-soft">← {localeUpper(t('back'), locale)}</Text>
      </ArenaPressable>

      <Text className="mt-6 text-2xl font-black text-arena-text">⚙️ {t('title')}</Text>

      <Text className="mt-6 mb-2 text-xs font-bold uppercase tracking-widest text-arena-text-soft">
        {t('appSettingsHeading')}
      </Text>
      <View className="gap-2">
        <SettingsRow icon="🌐" label={t('language')}>
          <View className="flex-row gap-1 rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1">
            {locales.map((l) => (
              <ArenaPressable
                key={l}
                onPress={() => setLocale(l)}
                className={`rounded-full px-3 py-1 ${locale === l ? 'bg-arena-accent' : ''}`}
              >
                <Text
                  className={locale === l ? 'text-xs font-semibold text-[#2A1E00]' : 'text-xs text-arena-text-soft'}
                >
                  {tLang(l)}
                </Text>
              </ArenaPressable>
            ))}
          </View>
        </SettingsRow>

        <SettingsRow icon="🔊" label={t('sound')}>
          <Toggle value={soundEnabled} onChange={setSoundEnabled} />
        </SettingsRow>

        <SettingsRow icon="📳" label={t('haptics')}>
          <Toggle value={hapticsEnabled} onChange={setHapticsEnabled} />
        </SettingsRow>
      </View>

      <View className="mt-8 gap-3 rounded-2xl border-2 border-arena-accent/40 bg-arena-accent/10 p-4">
        <Text className="text-lg font-bold text-arena-text">{t('accountLinking.heading')}</Text>
        <Text className="text-sm text-arena-text-soft">{t('accountLinking.description')}</Text>

        {linkStatus === 'linked' ? (
          <Text className="text-base font-semibold text-arena-accent-2">{t('accountLinking.linked')}</Text>
        ) : (
          <View className="gap-3">
            <ArenaPressable
              onPress={() => void handleGoogleLink()}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-arena-card py-4"
            >
              <Text className="text-base">🔵</Text>
              <Text className="text-base font-bold text-[#1A1330]">{t('accountLinking.google')}</Text>
            </ArenaPressable>

            {appleAvailable && (
              <ArenaPressable onPress={() => void handleAppleLink()} className="flex-row items-center justify-center gap-2 rounded-xl bg-arena-text py-4">
                <Text className="text-base">🍎</Text>
                <Text className="text-base font-bold text-[#1A1330]">{t('accountLinking.apple')}</Text>
              </ArenaPressable>
            )}

            <View className="flex-row gap-2">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('accountLinking.emailPlaceholder')}
                placeholderTextColor="#8FE8C4"
                autoCapitalize="none"
                keyboardType="email-address"
                className="flex-1 rounded-xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-3 text-base text-arena-text"
              />
              <ArenaPressable onPress={() => void handleEmailLink()} className="items-center justify-center rounded-xl bg-arena-accent-2 px-4">
                <Text className="text-sm font-bold text-[#04231A]">{t('accountLinking.sendEmailLink')}</Text>
              </ArenaPressable>
            </View>

            {linkStatus === 'emailSent' && <Text className="text-sm text-arena-accent-2">{t('accountLinking.emailSent')}</Text>}
            {linkStatus === 'failed' && <Text className="text-sm text-red-400">{t('accountLinking.linkFailed')}</Text>}
          </View>
        )}
      </View>

      <Text className="mt-8 mb-2 text-xs font-bold uppercase tracking-widest text-arena-text-soft">
        {t('appInfoHeading')}
      </Text>
      <View className="gap-2 pb-6">
        <View className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft px-4 py-4">
          <Text className="text-sm font-semibold text-arena-text">{t('version')}</Text>
          <Text className="text-sm text-arena-text-soft">1.0.0</Text>
        </View>
        <ArenaPressable onPress={() => router.push('/privacy')} className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft px-4 py-4">
          <Text className="text-sm font-semibold text-arena-text">{t('privacyLink')}</Text>
          <Text className="text-arena-text-soft">›</Text>
        </ArenaPressable>
        <ArenaPressable onPress={() => router.push('/terms')} className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft px-4 py-4">
          <Text className="text-sm font-semibold text-arena-text">{t('termsLink')}</Text>
          <Text className="text-arena-text-soft">›</Text>
        </ArenaPressable>
      </View>
      </ScrollView>
      <BottomTabBar active="settings" />
    </ArenaBackground>
  );
}

function SettingsRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft px-4 py-4">
      <View className="flex-row items-center gap-3">
        <Text className="text-lg">{icon}</Text>
        <Text className="text-sm font-semibold text-arena-text">{label}</Text>
      </View>
      {children}
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <ArenaPressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className={`h-6 w-10 justify-center rounded-full p-0.5 ${value ? 'bg-arena-accent-2' : 'bg-white/20'}`}
    >
      <View className={`h-5 w-5 rounded-full bg-arena-card ${value ? 'self-end' : 'self-start'}`} />
    </ArenaPressable>
  );
}
