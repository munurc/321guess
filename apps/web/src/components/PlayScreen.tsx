import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslations } from "use-intl";
import type { Dataset, Round } from "@321guess/core";
import { buildPool, pickRound } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { fetchLiveRoundPlayers } from "../lib/live-players";
import { useGameSettings } from "../lib/game-settings-context";
import { Countdown } from "./Countdown";
import { RoundView } from "./RoundView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type Phase = "countdown" | "round";

function roundKey(round: Round): string {
  return round.kind === "clubClub"
    ? `cc-${round.clubA.id}-${round.clubB.id}`
    : `cn-${round.country.code}-${round.club.id}`;
}

export function PlayScreen() {
  const t = useTranslations("play");
  const router = useRouter();
  const { settings } = useGameSettings();
  const [phase, setPhase] = useState<Phase>("countdown");
  const [round, setRound] = useState<Round | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    if (!settings) {
      router.replace("/");
      return;
    }
    loadDataset().then(setDataset);
  }, [settings, router]);

  const rollNext = useCallback(() => {
    if (!dataset || !settings) return;
    const pool = buildPool(dataset, settings);
    const excluded = new Set(settings.excludedCountries);
    const next = pickRound(pool, settings.mode, excluded, settings.difficulty);
    setRound(next);
    if (next) {
      const controller = new AbortController();
      fetchLiveRoundPlayers(next, controller.signal).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || roundKey(current) !== roundKey(next)) return current;
          return { ...current, correctPlayers: live };
        });
      });
    }
  }, [dataset, settings]);

  useEffect(() => {
    if (dataset && settings && !round) rollNext();
  }, [dataset, settings, round, rollNext]);

  if (!settings) return null; // redirecting, per the effect above

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="px-4 py-4">
          <Pressable onPress={() => router.push("/")}>
            <Text className="text-xs uppercase tracking-wider text-arena-text-soft">← {t("backToSetup")}</Text>
          </Pressable>
        </View>

        {phase === "countdown" ? (
          <Countdown onDone={() => setPhase("round")} />
        ) : !round ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-arena-text-soft">{t("rerolling")}</Text>
          </View>
        ) : (
          <RoundView key={roundKey(round)} round={round} onNext={rollNext} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-4 py-4">
        <Pressable onPress={() => router.push("/")}>
          <Text className="text-xs uppercase tracking-wider text-ink-mute">← {t("backToSetup")}</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      {phase === "countdown" ? (
        <Countdown onDone={() => setPhase("round")} />
      ) : !round ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-ink-mute">{t("rerolling")}</Text>
        </View>
      ) : (
        <RoundView key={roundKey(round)} round={round} onNext={rollNext} />
      )}
    </View>
  );
}
