import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

type Tab = { key: string; href: "/" | "/challenge" | "/scores" | "/settings"; icon: string };

const TABS: Tab[] = [
  { key: "home", href: "/", icon: "🏠" },
  { key: "challenges", href: "/challenge", icon: "🏆" },
  { key: "scores", href: "/scores", icon: "📊" },
  { key: "settings", href: "/settings", icon: "⚙️" },
];

/** Persistent bottom navigation for the four main native screens (Setup,
 * Challenge hub, Scores, Settings). Not a real Expo Router tab layout —
 * those four routes stay where they are in the flat route tree, and this
 * is just a shared UI component each of them renders at the bottom of its
 * own native branch, matching this codebase's established
 * Platform.OS-conditional-styling convention rather than introducing a
 * second navigation paradigm. Deliberately absent from Play/Online/Manual
 * (active gameplay hides all chrome) and from web entirely. */
export function BottomTabBar({ active }: { active: Tab["key"] }) {
  const t = useTranslations("tabBar");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row border-t border-arena-bg-soft bg-arena-bg"
      style={{ paddingBottom: insets.bottom || 12, paddingTop: 10 }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!isActive) router.push(tab.href as never);
            }}
            className="flex-1 items-center gap-1"
          >
            <Text className="text-xl" style={{ opacity: isActive ? 1 : 0.5 }}>
              {tab.icon}
            </Text>
            <Text
              className={`text-[11px] font-semibold ${isActive ? "text-arena-accent" : "text-arena-text-soft"}`}
            >
              {t(tab.key)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
