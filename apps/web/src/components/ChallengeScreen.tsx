import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode, Player } from "@321guess/core";
import {
  listChallenges,
  createChallenge,
  sendChallenge,
  submitChallengeGuess,
  finishChallenge,
  searchUsernames,
  type ChallengeList,
  type ChallengeRow,
  type FinishChallengeResult,
} from "../lib/challenge-api";
import { loadDataset } from "../lib/dataset";
import { shareOrCopy } from "../lib/share";
import { loadIdentity, type Identity } from "../lib/online-storage";
import { ArenaPressable } from "./ArenaPressable";
import { GameSettingsPicker } from "./GameSettingsPicker";
import { RoundPlayView } from "./RoundPlayView";

type Screen =
  | { kind: "hub" }
  | { kind: "new-settings" }
  | { kind: "new-playing"; challenge: ChallengeRow }
  | { kind: "new-send"; challenge: ChallengeRow; result: FinishChallengeResult };
// Task 23 extends this union further with the random-opponent and
// incoming-invite play/result phases.

export function ChallengeScreen() {
  const t = useTranslations("challenge");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useLocale();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [list, setList] = useState<ChallengeList | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "hub" });

  // --- Settings-picking phase state ---
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());

  // --- Playing phase state ---
  const [questionIndex, setQuestionIndex] = useState(0);
  const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
  const [wrongPlayers, setWrongPlayers] = useState<Player[]>([]);
  const [overallFoundCount, setOverallFoundCount] = useState(0);
  const [celebrationTick, setCelebrationTick] = useState(0);
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);
  const feedbackIdRef = useRef(0);

  // --- Send phase state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [sendStatus, setSendStatus] = useState<"idle" | "sent" | "link">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    loadIdentity().then(setIdentity);
  }, []);

  useEffect(() => {
    loadDataset().then((d) => {
      setDataset(d);
      setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
    });
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

  function toggleLeague(id: string) {
    setIncludedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleCountry(code: string) {
    setExcludedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const clubCountries = useMemo(() => {
    if (!dataset) return [];
    const codes = new Set<string>();
    for (const p of dataset.players) codes.add(p.nationalityCode);
    return dataset.countries.filter((c) => codes.has(c.code));
  }, [dataset]);

  async function startNewChallenge() {
    if (!identity || !dataset) return;
    const res = await createChallenge(identity.token, mode, difficulty, [...includedLeagues]);
    if (res.status === "ok") setScreen({ kind: "new-playing", challenge: res.data });
  }

  function flashGuessFeedback(status: "correct" | "wrong", label: string) {
    const id = ++feedbackIdRef.current;
    setGuessFeedback({ id, status, label });
    setTimeout(() => setGuessFeedback((cur) => (cur?.id === id ? null : cur)), 1100);
  }

  async function submitPlayGuess(challenge: ChallengeRow, player: Player) {
    if (!identity || foundPlayers.some((p) => p.id === player.id) || wrongPlayers.some((p) => p.id === player.id)) return;
    const res = await submitChallengeGuess(identity.token, challenge.id, questionIndex, player.id);
    if (res.status !== "ok") return;
    if (res.data.correct) {
      flashGuessFeedback("correct", player.name);
      setFoundPlayers((prev) => [...prev, player]);
      setOverallFoundCount(res.data.overallFoundCount);
      setCelebrationTick((n) => n + 1);
    } else {
      flashGuessFeedback("wrong", player.name);
      setWrongPlayers((prev) => [...prev, player]);
    }
  }

  async function goToNextPlayQuestion(challenge: ChallengeRow) {
    const next = questionIndex + 1;
    if (next >= challenge.questions.length) {
      await finishPlaying(challenge);
      return;
    }
    setQuestionIndex(next);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
  }

  async function finishPlaying(challenge: ChallengeRow) {
    if (!identity) return;
    const res = await finishChallenge(identity.token, challenge.id);
    if (res.status !== "ok") return;
    setScreen({ kind: "new-send", challenge, result: res.data });
  }

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchUsernames(searchQuery.trim()).then(setSearchResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function sendToUsername(challenge: ChallengeRow, username: string) {
    if (!identity) return;
    const res = await sendChallenge(identity.token, challenge.id, username);
    if (res.status === "ok") setSendStatus("sent");
  }

  async function generateLink(challenge: ChallengeRow) {
    if (!identity) return;
    const res = await sendChallenge(identity.token, challenge.id);
    if (res.status === "ok" && res.data.deliveryType === "link") setShareUrl(res.data.url);
  }

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
              onPress={() => setScreen({ kind: "new-settings" })}
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

  if (screen.kind === "new-settings") {
    if (!dataset) {
      return (
        <View className="flex-1 items-center justify-center bg-arena-bg">
          <Text className="text-arena-text-soft">{t("loading")}</Text>
        </View>
      );
    }
    return (
      <View className="flex-1 bg-arena-bg">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 pb-10" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => setScreen({ kind: "hub" })}>
            <Text className="text-sm tracking-wider text-arena-text-soft">← {t("title")}</Text>
          </Pressable>
          <Text className="text-2xl font-black text-arena-text">{t("newSettingsHeading")}</Text>
          <GameSettingsPicker
            mode={mode}
            difficulty={difficulty}
            includedLeagues={includedLeagues}
            excludedCountries={excludedCountries}
            onModeChange={setMode}
            onDifficultyChange={setDifficulty}
            onToggleLeague={toggleLeague}
            onToggleCountry={toggleCountry}
            onSelectAllLeagues={() => dataset && setIncludedLeagues(new Set(dataset.leagues.map((l) => l.id)))}
            onClearAllLeagues={() => setIncludedLeagues(new Set())}
            dataset={dataset}
            clubCountries={clubCountries}
            countriesReady={true}
            locale={locale}
          />
        </ScrollView>
        <View className="border-t border-arena-bg-soft px-4 pb-6 pt-4">
          <ArenaPressable
            onPress={() => void startNewChallenge()}
            disabled={includedLeagues.size === 0}
            className={`items-center rounded-2xl border-b-[6px] py-6 ${
              includedLeagues.size === 0 ? "border-arena-bg-soft bg-arena-bg-soft" : "border-arena-accent-strong bg-arena-accent"
            }`}
          >
            <Text className={`text-2xl font-bold ${includedLeagues.size === 0 ? "text-arena-text-soft" : "text-[#2A1E00]"}`}>
              {t("startPlaying")}
            </Text>
          </ArenaPressable>
        </View>
      </View>
    );
  }

  if (screen.kind === "new-playing") {
    const challenge = screen.challenge;
    const currentQuestion = challenge.questions[questionIndex];
    if (!dataset || !currentQuestion) return null;

    return (
      <View className="flex-1 bg-arena-bg">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-4 pb-10" style={{ paddingTop: insets.top + 16 }}>
          <Text className="text-sm text-arena-text-soft">
            {questionIndex + 1} / {challenge.questions.length}
          </Text>
          <RoundPlayView
            question={{
              clubA: currentQuestion.clubA,
              clubB: currentQuestion.clubB,
              totalPossible: currentQuestion.totalPossible,
            }}
            foundPlayers={foundPlayers}
            wrongPlayers={wrongPlayers}
            players={dataset.players}
            celebrationTick={celebrationTick}
            guessFeedback={guessFeedback}
            onGuess={(p) => void submitPlayGuess(challenge, p)}
            vsLabel={t("vs")}
            possibleCountLabel=""
            guessPlaceholder={t("searchPlaceholder")}
            guessEmptyText={t("searchEmpty")}
          />
          <ArenaPressable
            onPress={() => void goToNextPlayQuestion(challenge)}
            className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
          >
            <Text className="text-lg font-bold text-[#2A1E00]">{foundPlayers.length > 0 ? "→" : "→"}</Text>
          </ArenaPressable>
        </ScrollView>
      </View>
    );
  }

  if (screen.kind === "new-send") {
    const { challenge, result } = screen;
    return (
      <View className="flex-1 bg-arena-bg px-4" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-2xl font-black text-arena-text">{t("sendHeading")}</Text>
        <Text className="mt-2 text-lg text-arena-accent-2">
          {t("sendScoreLabel", { correct: result.correctCount, total: result.totalPossible })}
        </Text>

        {sendStatus === "sent" ? (
          <Text className="mt-8 text-lg text-arena-accent-2">{t("sentSuccess")}</Text>
        ) : shareUrl ? (
          <Pressable
            onPress={() => void shareOrCopy(shareUrl).then(() => setSendStatus("link"))}
            className="mt-8 items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
          >
            <Text className="text-lg font-bold text-[#2A1E00]">{sendStatus === "link" ? t("linkCopied") : shareUrl}</Text>
          </Pressable>
        ) : (
          <View className="mt-8 gap-4">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("searchPlaceholder")}
              placeholderTextColor="#8FE8C4"
              autoCapitalize="none"
              className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text"
            />
            {searchResults.map((username) => (
              <Pressable
                key={username}
                onPress={() => void sendToUsername(challenge, username)}
                className="rounded-xl bg-arena-bg-soft px-4 py-3"
              >
                <Text className="text-lg text-arena-text">{username}</Text>
              </Pressable>
            ))}
            <Text className="text-center text-arena-text-soft">{t("orGenerateLink")}</Text>
            <ArenaPressable
              onPress={() => void generateLink(challenge)}
              className="items-center rounded-2xl border-2 border-arena-accent-2 py-5"
            >
              <Text className="text-lg font-bold text-arena-accent-2">{t("generateLink")}</Text>
            </ArenaPressable>
          </View>
        )}
      </View>
    );
  }

  return null;
}
