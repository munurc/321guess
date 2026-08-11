import { Pressable, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { messages } from "@/i18n/messages";
import { useAppLocale } from "@/i18n/AppLocaleContext";

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const { locale, setLocale } = useAppLocale();
  const locales = Object.keys(messages) as (keyof typeof messages)[];

  return (
    <View className="flex-row gap-1 rounded-full border border-ink/10 bg-ink/5 p-1">
      {locales.map((l) => (
        <Pressable
          key={l}
          onPress={() => setLocale(l)}
          className={`rounded-full px-3 py-1 ${locale === l ? "bg-accent" : ""}`}
        >
          <Text className={locale === l ? "font-semibold text-paper" : "text-ink-soft"}>
            {t(l)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
