import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ArenaPressable } from './ArenaPressable';
import { useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { useGameSettings } from '@/lib/game-settings-context';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const tLang = useTranslations('language');
  const router = useRouter();
  const { locale, setLocale } = useAppLocale();
  const { soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled } = useGameSettings();
  const locales = Object.keys(messages) as (keyof typeof messages)[];

  return (
    <View className="flex-1 bg-arena-bg px-4 py-8">
      <ArenaPressable onPress={() => router.back()}>
        <Text className="text-xs uppercase tracking-wider text-arena-text-soft">← {t('back')}</Text>
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
