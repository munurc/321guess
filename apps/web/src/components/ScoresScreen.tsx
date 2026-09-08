import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { fetchLeaderboard, type LeaderboardResponse } from "../lib/online-api";
import { loadIdentity } from "../lib/online-storage";
import { ArenaBackground } from "./ArenaBackground";
import { ArenaPressable } from "./ArenaPressable";
import { BottomTabBar } from "./BottomTabBar";
import { Leaderboard } from "./OnlineScreen";

/** The "Skorlar" tab — a dedicated home for the all-time/today leaderboard
 * that already existed tucked inside Daily Challenge's result view.
 * Reuses that same Leaderboard component and fetchLeaderboard call rather
 * than duplicating the logic. */
export function ScoresScreen() {
  const t = useTranslations("online");
  const tTabBar = useTranslations("tabBar");
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"today" | "total">("today");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (Platform.OS === "web") return;
    loadIdentity().then((identity) => setUsername(identity?.username ?? ""));
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    fetchLeaderboard(tab).then(setData);
  }, [tab]);

  if (Platform.OS === "web") return null;

  return (
    <ArenaBackground className="flex-1">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 16 }}>
        <Text className="mb-6 text-2xl font-black text-arena-text">📊 {tTabBar("scores")}</Text>

        <View className="mb-4 flex-row self-start rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1.5">
          {(["today", "total"] as const).map((tabKey) => (
            <ArenaPressable
              key={tabKey}
              onPress={() => setTab(tabKey)}
              className={`rounded-full px-5 py-2.5 ${tab === tabKey ? "bg-arena-accent" : ""}`}
            >
              <Text className={`text-base ${tab === tabKey ? "font-semibold text-[#2A1E00]" : "text-arena-text-soft"}`}>
                {t(`leaderboard.tab.${tabKey}`)}
              </Text>
            </ArenaPressable>
          ))}
        </View>

        <Leaderboard
          data={data}
          tab={tab}
          currentUsername={username}
          loadingText={t("loading")}
          emptyText={t("leaderboard.empty")}
        />
      </ScrollView>
      <BottomTabBar active="scores" />
    </ArenaBackground>
  );
}
