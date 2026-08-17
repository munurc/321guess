import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";

type Section = { heading: string; body: string };

/** Plain, cross-platform legal page — no arena styling. This isn't a game
 * screen, and it needs a stable, readable public URL for the App Store /
 * Play Console "privacy policy" fields, so it stays on the same paper/ink
 * theme as the rest of the (unstyled-for-native) app shell rather than the
 * native-only arena identity. */
export function PrivacyScreen() {
  const t = useTranslations("privacy");
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sections = t.raw("sections") as Section[];
  const updatedDate = new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

  return (
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentContainerClassName="gap-6 pb-16"
      contentContainerStyle={{ paddingTop: insets.top + 24 }}
    >
      <View>
        <Pressable onPress={() => router.push("/")}>
          <Text className="text-sm uppercase tracking-wider text-ink-mute">← {t("back")}</Text>
        </Pressable>
        <Text className="mt-4 text-3xl font-black text-accent">{t("title")}</Text>
        <Text className="mt-1 text-xs text-ink-mute">{t("updated", { date: updatedDate })}</Text>
        <Text className="mt-4 text-base leading-6 text-ink-soft">{t("intro")}</Text>
      </View>

      <View className="gap-5">
        {sections.map((section) => (
          <View key={section.heading}>
            <Text className="text-lg font-bold text-ink">{section.heading}</Text>
            <Text className="mt-1 text-base leading-6 text-ink-soft">{section.body}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
