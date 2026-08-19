import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";

import { useAnalyticsConsent } from "@/lib/analytics-consent";
import { localizedPath } from "@/lib/localized-path";

/** Web-only: GA is never installed on native, so there's nothing to ask
 * consent for there. */
export function CookieConsent() {
  const t = useTranslations("cookieConsent");
  const router = useRouter();
  const locale = useLocale();
  const { consent, setConsent } = useAnalyticsConsent();

  if (Platform.OS !== "web" || consent !== "unset") return null;

  return (
    <View className="fixed inset-x-0 bottom-0 z-50 flex-row flex-wrap items-center gap-3 border-t border-rule bg-paper px-4 py-3 shadow-lg">
      <Text className="flex-1 text-xs text-ink-soft">
        {t("text")}{" "}
        <Text
          className="text-xs text-accent underline"
          onPress={() => router.push(localizedPath("/privacy", locale) as never)}
        >
          {t("privacyLink")}
        </Text>
      </Text>
      <View className="flex-row gap-2">
        <Pressable onPress={() => setConsent("denied")} className="rounded-lg border border-rule px-3 py-2">
          <Text className="text-xs font-medium text-ink-soft">{t("decline")}</Text>
        </Pressable>
        <Pressable onPress={() => setConsent("granted")} className="rounded-lg bg-accent px-3 py-2">
          <Text className="text-xs font-medium text-paper">{t("accept")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
