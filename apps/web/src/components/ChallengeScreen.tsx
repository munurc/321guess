import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { listChallenges, type ChallengeList } from "../lib/challenge-api";
import { loadIdentity, type Identity } from "../lib/online-storage";
import { ArenaPressable } from "./ArenaPressable";

type Screen = { kind: "hub" };
// Tasks 22-23 extend this union with the creation-flow and play/result
// phases and replace the `screen` state's type accordingly.

export function ChallengeScreen() {
  const t = useTranslations("challenge");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [list, setList] = useState<ChallengeList | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "hub" });

  useEffect(() => {
    loadIdentity().then(setIdentity);
  }, []);

  const refreshList = useCallback(() => {
    if (!identity) return;
    listChallenges(identity.token).then((res) => {
      if (res.status === "ok") setList(res.data);
    });
  }, [identity]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // Refresh every time the hub regains focus (e.g. coming back from a
  // finished challenge) — matches the "in-app notification tab" role this
  // screen plays when push is disabled.
  useFocusEffect(
    useCallback(() => {
      if (screen.kind === "hub") refreshList();
    }, [screen, refreshList]),
  );

  if (!identity) {
    return (
      <View className="flex-1 items-center justify-center bg-arena-bg" style={{ paddingTop: insets.top }}>
        <Text className="text-arena-text-soft">{t("loading")}</Text>
      </View>
    );
  }

  if (screen.kind === "hub") {
    return (
      <View className="flex-1 bg-arena-bg">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-8 pb-10" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => router.push("/")}>
            <Text className="text-sm tracking-wider text-arena-text-soft">← {t("back")}</Text>
          </Pressable>

          <Text className="text-3xl font-black text-arena-text">{t("title")}</Text>

          <View className="gap-3">
            <ArenaPressable
              onPress={() => setScreen({ kind: "hub" } /* Task 22 replaces with the creation-flow entry */)}
              className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
            >
              <Text className="text-lg font-bold text-[#2A1E00]">{t("newChallenge")}</Text>
            </ArenaPressable>
            <ArenaPressable
              onPress={() => setScreen({ kind: "hub" } /* Task 23 replaces with the random-opponent entry */)}
              className="items-center rounded-2xl border-2 border-arena-accent-2 py-5"
            >
              <Text className="text-lg font-bold text-arena-accent-2">{t("randomOpponent")}</Text>
            </ArenaPressable>
          </View>

          <View className="gap-3">
            <Text className="text-lg font-semibold tracking-wider text-arena-text-soft">{t("incomingHeading")}</Text>
            {!list || list.incoming.length === 0 ? (
              <Text className="text-arena-text-soft">{t("emptyIncoming")}</Text>
            ) : (
              list.incoming.map((c) => (
                <ArenaPressable
                  key={c.id}
                  onPress={() => setScreen({ kind: "hub" } /* Task 23: open this challenge to play it */)}
                  className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4"
                >
                  <Text className="text-base font-semibold text-arena-text">{c.mode}</Text>
                  <Text className="font-bold text-arena-accent">{t("playNow")}</Text>
                </ArenaPressable>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-lg font-semibold tracking-wider text-arena-text-soft">{t("outgoingHeading")}</Text>
            {!list || list.outgoing.length === 0 ? (
              <Text className="text-arena-text-soft">{t("emptyOutgoing")}</Text>
            ) : (
              list.outgoing.map((c) => (
                <View key={c.id} className="rounded-2xl bg-arena-bg-soft p-4">
                  <Text className="text-base font-semibold text-arena-text">{t("waitingForOpponent")}</Text>
                </View>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-lg font-semibold tracking-wider text-arena-text-soft">{t("rivalriesHeading")}</Text>
            {!list || list.completed.length === 0 ? (
              <Text className="text-arena-text-soft">{t("emptyRivalries")}</Text>
            ) : (
              list.completed.map((c) => (
                <View key={c.id} className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4">
                  <Text className="text-base font-semibold text-arena-text">{c.opponentUsername}</Text>
                  <Text className="font-bold text-arena-accent-2">
                    {t("rivalryScore", { wins: c.rivalry.myWins, losses: c.rivalry.opponentWins })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return null;
}
