import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { ArenaPressable } from './ArenaPressable';
import { useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { isAppleSignInAvailable, sendMagicLink, signInWithApple, signInWithGoogle } from '../lib/account-auth';
import { linkAccount } from '../lib/account-api';
import { loadIdentity } from '../lib/online-storage';
import { supabase } from '../lib/supabase-client';
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
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
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
    <View className="flex-1 bg-arena-bg px-4 pb-8" style={{ paddingTop: insets.top + 32 }}>
      <ArenaPressable onPress={() => router.back()}>
        <Text className="text-xs tracking-wider text-arena-text-soft">← {localeUpper(t('back'), locale)}</Text>
      </ArenaPressable>

      <Text className="mt-6 text-2xl font-black text-arena-text">{t('title')}</Text>

      <View className="mt-8 gap-1">
        <SettingsRow label={t('language')}>
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

        <SettingsRow label={t('sound')}>
          <Toggle value={soundEnabled} onChange={setSoundEnabled} />
        </SettingsRow>

        <SettingsRow label={t('haptics')}>
          <Toggle value={hapticsEnabled} onChange={setHapticsEnabled} />
        </SettingsRow>
      </View>

      <View className="mt-6 gap-3">
        <ArenaPressable onPress={() => router.push('/privacy')} className="items-start">
          <Text className="text-sm text-arena-text-soft underline">{t('privacyLink')}</Text>
        </ArenaPressable>
        <ArenaPressable onPress={() => router.push('/terms')} className="items-start">
          <Text className="text-sm text-arena-text-soft underline">{t('termsLink')}</Text>
        </ArenaPressable>
      </View>

      <View className="mt-8 gap-3">
        <Text className="text-lg font-bold text-arena-text">{t('accountLinking.heading')}</Text>
        <Text className="text-sm text-arena-text-soft">{t('accountLinking.description')}</Text>

        {linkStatus === 'linked' ? (
          <Text className="text-base font-semibold text-arena-accent-2">{t('accountLinking.linked')}</Text>
        ) : (
          <View className="gap-3">
            <ArenaPressable
              onPress={() => void handleGoogleLink()}
              className="items-center rounded-xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-4"
            >
              <Text className="text-base font-bold text-[#2A1E00]">{t('accountLinking.google')}</Text>
            </ArenaPressable>

            {appleAvailable && (
              <ArenaPressable onPress={() => void handleAppleLink()} className="items-center rounded-xl border border-arena-text py-4">
                <Text className="text-base font-bold text-arena-text">{t('accountLinking.apple')}</Text>
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
    </View>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between border-b border-arena-bg-soft py-3">
      <Text className="text-sm font-semibold text-arena-text">{label}</Text>
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
      className={`h-6 w-10 justify-center rounded-full p-0.5 ${value ? 'bg-arena-accent-2' : 'bg-arena-bg-soft'}`}
    >
      <View className={`h-5 w-5 rounded-full bg-arena-card ${value ? 'self-end' : 'self-start'}`} />
    </ArenaPressable>
  );
}
