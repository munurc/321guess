import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode, Player } from "@321guess/core";
import {
  listChallenges,
  cancelChallenge,
  createChallenge,
  sendChallenge,
  submitChallengeGuess,
  finishChallenge,
  searchUsernames,
  matchRandomChallenge,
  type ChallengeList,
  type ChallengeRow,
  type FinishChallengeResult,
  type OutgoingChallenge,
} from "../lib/challenge-api";
import { loadDataset } from "../lib/dataset";
import { loadIdentity, type Identity } from "../lib/online-storage";
import { ArenaBackground } from "./ArenaBackground";
import { ArenaPressable } from "./ArenaPressable";
import { BottomTabBar } from "./BottomTabBar";
import { Countdown } from "./Countdown";
import { GameSettingsPicker } from "./GameSettingsPicker";
import { InitialAvatar } from "./InitialAvatar";
import { RoundPlayView } from "./RoundPlayView";
import { useScrollToEndOnKeyboard } from "../lib/use-scroll-to-end-on-keyboard";

type Screen =
  | { kind: "hub" }
  | { kind: "new-settings" }
  // Every entry into a playing screen routes through here first: the 3-2-1
  // countdown is a standing requirement for every game mode.
  | { kind: "countdown"; next: "new-playing" | "opponent-playing"; challenge: ChallengeRow }
  | { kind: "new-playing"; challenge: ChallengeRow }
  | { kind: "new-send"; challenge: ChallengeRow; result: FinishChallengeResult }
  | { kind: "opponent-playing"; challenge: ChallengeRow }
  | { kind: "result"; challenge: ChallengeRow; myResult: FinishChallengeResult; opponentUsername: string | null };

export function ChallengeScreen() {
  const t = useTranslations("challenge");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useLocale();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [list, setList] = useState<ChallengeList | null>(null);
  // Declining an invite has no server-side concept today (there's no
  // "decline" endpoint) — this just hides it from THIS device's view for
  // the current session; refreshing the list (e.g. reopening the hub
  // later) brings it back until the sender's challenge expires on its own.
  const [dismissedInviteIds, setDismissedInviteIds] = useState<Set<string>>(new Set());
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
  const [celebrationTick, setCelebrationTick] = useState(0);
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);
  const feedbackIdRef = useRef(0);
  const playScrollRef = useRef<ScrollView>(null);
  useScrollToEndOnKeyboard(playScrollRef, screen.kind === "new-playing" || screen.kind === "opponent-playing");

  // --- Send phase state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  // Keyed by challenge id: a plain "sent" flag outlived the challenge it was
  // for, so every later friend challenge skipped straight to "sent".
  const [sentTo, setSentTo] = useState<{ challengeId: string; username: string } | null>(null);

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

  function confirmDeleteOutgoing(challenge: OutgoingChallenge) {
    Alert.alert(t("deleteConfirmTitle"), t("deleteConfirmMessage"), [
      { text: t("deleteConfirmCancel"), style: "cancel" },
      {
        text: t("deleteChallenge"),
        style: "destructive",
        onPress: () => {
          if (!identity) return;
          // Optimistic: drop it from the list right away, then re-sync with
          // the server either way so a failed delete reappears.
          setList((prev) => (prev ? { ...prev, outgoing: prev.outgoing.filter((c) => c.id !== challenge.id) } : prev));
          void cancelChallenge(identity.token, challenge.id).finally(refreshList);
        },
      },
    ]);
  }

  function outgoingLabel(c: OutgoingChallenge): string {
    if (c.opponentUsername) return t("waitingForUser", { username: c.opponentUsername });
    if (c.deliveryType === "random") return t("waitingForRandom");
    return t("notSent");
  }

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

  function resetPlayState() {
    setQuestionIndex(0);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
  }

  async function startNewChallenge() {
    if (!identity || !dataset) return;
    const res = await createChallenge(identity.token, mode, difficulty, [...includedLeagues], [...excludedCountries]);
    if (res.status !== "ok") return;
    resetPlayState();
    setScreen({ kind: "countdown", next: "new-playing", challenge: res.data });
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
      setCelebrationTick((n) => n + 1);
    } else {
      flashGuessFeedback("wrong", player.name);
      setWrongPlayers((prev) => [...prev, player]);
    }
  }

  async function goToNextPlayQuestion(challenge: ChallengeRow, onDone: (c: ChallengeRow) => Promise<void>) {
    const next = questionIndex + 1;
    if (next >= challenge.questions.length) {
      await onDone(challenge);
      return;
    }
    setQuestionIndex(next);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
  }

  // `completed` is true only once BOTH sides have finished, so it — not which
  // screen we came from — decides whether there's a real result to show. In
  // random mode either player can be the one who finishes second.
  async function finishPlaying(challenge: ChallengeRow) {
    if (!identity) return;
    const res = await finishChallenge(identity.token, challenge.id);
    if (res.status !== "ok") return;
    if (res.data.completed) {
      // The other player had already claimed and finished this challenge
      // before we did — the result is real and ready right now.
      setScreen({
        kind: "result",
        challenge,
        myResult: res.data,
        opponentUsername: res.data.opponentResult?.username ?? null,
      });
      refreshList();
      return;
    }
    if (challenge.deliveryType === "random") {
      // Already queued for random matching at creation — nothing to send,
      // it matches automatically once another player also taps "Rastgele
      // Rakip". Refresh the hub's list so the new outgoing entry shows up.
      refreshList();
      setScreen({ kind: "hub" });
      return;
    }
    setScreen({ kind: "new-send", challenge, result: res.data });
  }

  async function startRandomOpponent() {
    if (!identity) return;
    const res = await matchRandomChallenge(identity.token);
    if (res.status !== "ok") return;
    resetPlayState();
    setScreen({
      kind: "countdown",
      next: res.data.role === "opponent" ? "opponent-playing" : "new-playing",
      challenge: res.data,
    });
  }

  function openIncomingChallenge(challenge: ChallengeRow) {
    resetPlayState();
    setScreen({ kind: "countdown", next: "opponent-playing", challenge });
  }

  // FinishChallengeResult.opponentResult.username (Task 5/16) is the other
  // player's username — no separate lookup needed.
  async function finishOpponentPlaying(challenge: ChallengeRow) {
    if (!identity) return;
    const res = await finishChallenge(identity.token, challenge.id);
    if (res.status !== "ok") return;
    refreshList();
    if (!res.data.completed) {
      // Rare race in random mode: this player finished before the challenge's
      // creator did. Nothing to show yet — the result appears once the creator
      // also finishes (their own finishPlaying will show it then). Showing a
      // "result" here would fabricate a win against someone who hasn't played.
      setScreen({ kind: "hub" });
      return;
    }
    setScreen({
      kind: "result",
      challenge,
      myResult: res.data,
      opponentUsername: res.data.opponentResult?.username ?? null,
    });
  }

  async function rematch(challenge: ChallengeRow, opponentUsername: string | null) {
    if (!identity || !opponentUsername) return;
    const res = await createChallenge(
      identity.token,
      challenge.mode as GameMode,
      challenge.difficulty as Difficulty,
      challenge.includedLeagues,
      [],
    );
    if (res.status !== "ok") return;
    resetPlayState();
    setScreen({ kind: "countdown", next: "new-playing", challenge: res.data });
    // The send step (Task 22's "new-send" screen) is reached after playing,
    // same as any new challenge — opponentUsername is prefilled by having
    // the user re-search, since /send's search step doesn't currently
    // accept a prefilled default. Acceptable for v1: a rematch still saves
    // the settings-picking step, which is the main friction being removed.
  }

  useEffect(() => {
    const token = identity?.token;
    if (!token || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchUsernames(token, searchQuery.trim()).then(setSearchResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [identity, searchQuery]);

  async function sendToUsername(challenge: ChallengeRow, username: string) {
    if (!identity) return;
    const res = await sendChallenge(identity.token, challenge.id, username);
    if (res.status === "ok") setSentTo({ challengeId: challenge.id, username });
  }

  if (!identity) {
    return (
      <ArenaBackground className="flex-1 items-center justify-center" style={{ paddingTop: insets.top }}>
        <Text className="text-arena-text-soft">{t("loading")}</Text>
      </ArenaBackground>
    );
  }

  if (screen.kind === "hub") {
    const visibleIncoming = (list?.incoming ?? []).filter((c) => !dismissedInviteIds.has(c.id));
    return (
      <ArenaBackground className="flex-1">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 pb-4" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => router.push("/")}>
            <Text className="text-sm tracking-wider text-arena-text-soft">← {t("back")}</Text>
          </Pressable>

          <Text className="font-display text-2xl text-arena-text">🏆 {t("title")}</Text>

          <ArenaPressable
            onPress={() => setScreen({ kind: "new-settings" })}
            className="flex-row items-center justify-center gap-2 rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
          >
            <Text className="text-lg">⚡</Text>
            <Text className="text-lg font-bold text-[#2A1E00]">{t("newChallenge")}</Text>
          </ArenaPressable>
          <ArenaPressable
            onPress={() => void startRandomOpponent()}
            className="flex-row items-center justify-center gap-2 rounded-2xl border-b-[6px] border-arena-accent-2-strong bg-arena-accent-2 py-5"
          >
            <Text className="text-lg">👥</Text>
            <Text className="text-lg font-bold text-[#04231A]">{t("randomOpponent")}</Text>
          </ArenaPressable>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">
              {t("incomingHeading")}
              {visibleIncoming.length > 0 ? ` (${visibleIncoming.length})` : ""}
            </Text>
            {visibleIncoming.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyIncoming")}</Text>
            ) : (
              visibleIncoming.map((c) => (
                <View key={c.id} className="flex-row items-start gap-3 rounded-2xl bg-arena-bg-soft p-4">
                  <InitialAvatar username={c.fromUsername} />
                  <View className="flex-1 gap-2">
                    <Text className="text-base font-bold text-arena-text">{c.fromUsername}</Text>
                    <Text className="text-sm text-arena-text-soft">{t("inviteMessage")}</Text>
                    <View className="mt-1 flex-row gap-2">
                      <Pressable
                        onPress={() => setDismissedInviteIds((prev) => new Set(prev).add(c.id))}
                        className="flex-1 items-center rounded-xl bg-arena-bg py-2.5"
                      >
                        <Text className="text-sm font-bold text-arena-text-soft">{t("decline")}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openIncomingChallenge(c)}
                        className="flex-1 items-center rounded-xl bg-arena-accent py-2.5"
                      >
                        <Text className="text-sm font-bold text-[#2A1E00]">{t("accept")}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">{t("outgoingHeading")}</Text>
            {!list || list.outgoing.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyOutgoing")}</Text>
            ) : (
              list.outgoing.map((c) => (
                <View key={c.id} className="flex-row items-center gap-3 rounded-2xl bg-arena-bg-soft p-4">
                  {c.opponentUsername ? (
                    <InitialAvatar username={c.opponentUsername} size={36} />
                  ) : (
                    <Text className="w-9 text-center text-2xl">{c.deliveryType === "random" ? "🎲" : "✉️"}</Text>
                  )}
                  <Text className="flex-1 text-base font-semibold text-arena-text">{outgoingLabel(c)}</Text>
                  <Pressable
                    onPress={() => confirmDeleteOutgoing(c)}
                    hitSlop={8}
                    accessibilityLabel={t("deleteChallenge")}
                    className="rounded-full border border-arena-accent-2 px-3 py-1.5"
                  >
                    <Text className="text-sm font-semibold text-arena-text-soft">{t("deleteChallenge")}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">{t("rivalriesHeading")}</Text>
            {!list || list.completed.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyRivalries")}</Text>
            ) : (
              list.completed.map((c) => (
                <View key={c.id} className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4">
                  <View className="flex-row items-center gap-3">
                    <InitialAvatar username={c.opponentUsername} size={36} />
                    <Text className="text-base font-semibold text-arena-text">{c.opponentUsername}</Text>
                  </View>
                  <Text className="font-bold text-arena-accent-2">
                    {t("rivalryScore", { wins: c.rivalry.myWins, losses: c.rivalry.opponentWins })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
        <BottomTabBar active="challenges" />
      </ArenaBackground>
    );
  }

  if (screen.kind === "new-settings") {
    if (!dataset) {
      return (
        <ArenaBackground className="flex-1 items-center justify-center">
          <Text className="text-arena-text-soft">{t("loading")}</Text>
        </ArenaBackground>
      );
    }
    return (
      <ArenaBackground className="flex-1">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-6 pb-10" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => setScreen({ kind: "hub" })}>
            <Text className="text-sm tracking-wider text-arena-text-soft">← {t("title")}</Text>
          </Pressable>
          <Text className="font-display text-2xl text-arena-text">{t("newSettingsHeading")}</Text>
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
      </ArenaBackground>
    );
  }

  if (screen.kind === "countdown") {
    const { next, challenge } = screen;
    return (
      <ArenaBackground className="flex-1">
        <Countdown onDone={() => setScreen({ kind: next, challenge })} />
      </ArenaBackground>
    );
  }

  if (screen.kind === "new-playing") {
    const challenge = screen.challenge;
    const currentQuestion = challenge.questions[questionIndex];
    if (!dataset || !currentQuestion) return null;

    return (
      <ArenaBackground className="flex-1">
        <ScrollView
          ref={playScrollRef}
          className="flex-1 px-4"
          contentContainerClassName="gap-4 pb-10"
          style={{ paddingTop: insets.top + 16 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
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
            guessPlaceholder={t("guessPlaceholder")}
            guessEmptyText={t("guessEmpty")}
          />
          <ArenaPressable
            onPress={() => void goToNextPlayQuestion(challenge, finishPlaying)}
            className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
          >
            <Text className="text-xl font-bold text-[#2A1E00]">→</Text>
          </ArenaPressable>
        </ScrollView>
      </ArenaBackground>
    );
  }

  if (screen.kind === "new-send") {
    const { challenge, result } = screen;
    return (
      <ArenaBackground className="flex-1 px-4" style={{ paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => setScreen({ kind: "hub" })}>
          <Text className="text-sm tracking-wider text-arena-text-soft">← {t("back")}</Text>
        </Pressable>

        <Text className="font-display mt-6 text-2xl text-arena-text">{t("sendHeading")}</Text>
        <Text className="mt-2 text-lg text-arena-accent-2">
          {t("sendScoreLabel", { correct: result.correctCount, total: result.totalPossible })}
        </Text>

        {/* Username search + send is the only delivery option: the former
            "generate a link" flow produced https://www.321guess.com/challenge/<id>,
            a URL with no matching route and no deep-link handling. */}
        {sentTo?.challengeId === challenge.id ? (
          <Text className="mt-8 text-lg text-arena-accent-2">{t("sentSuccess", { username: sentTo.username })}</Text>
        ) : (
          <View className="mt-8 flex-1 gap-3">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("searchPlaceholder")}
              placeholderTextColor="#8FE8C4"
              autoCapitalize="none"
              className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-5 py-5 text-xl text-arena-text"
            />
            {searchResults.map((username) => (
              <View key={username} className="flex-row items-center gap-3 rounded-2xl bg-arena-bg-soft px-4 py-3">
                <InitialAvatar username={username} />
                <Text className="flex-1 text-lg text-arena-text">{username}</Text>
                <Pressable
                  onPress={() => void sendToUsername(challenge, username)}
                  className="rounded-full bg-arena-accent px-4 py-2"
                >
                  <Text className="text-sm font-bold text-[#2A1E00]">{t("sendButton")}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ArenaBackground>
    );
  }

  if (screen.kind === "opponent-playing") {
    const challenge = screen.challenge;
    const currentQuestion = challenge.questions[questionIndex];
    if (!dataset || !currentQuestion) return null;

    return (
      <ArenaBackground className="flex-1">
        <ScrollView
          ref={playScrollRef}
          className="flex-1 px-4"
          contentContainerClassName="gap-4 pb-10"
          style={{ paddingTop: insets.top + 16 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text className="text-sm text-arena-text-soft">
            {questionIndex + 1} / {challenge.questions.length}
          </Text>
          <RoundPlayView
            question={{ clubA: currentQuestion.clubA, clubB: currentQuestion.clubB, totalPossible: currentQuestion.totalPossible }}
            foundPlayers={foundPlayers}
            wrongPlayers={wrongPlayers}
            players={dataset.players}
            celebrationTick={celebrationTick}
            guessFeedback={guessFeedback}
            onGuess={(p) => void submitPlayGuess(challenge, p)}
            vsLabel="×"
            possibleCountLabel=""
            guessPlaceholder={t("guessPlaceholder")}
            guessEmptyText={t("guessEmpty")}
          />
          <ArenaPressable
            onPress={() => void goToNextPlayQuestion(challenge, finishOpponentPlaying)}
            className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
          >
            <Text className="text-xl font-bold text-[#2A1E00]">→</Text>
          </ArenaPressable>
        </ScrollView>
      </ArenaBackground>
    );
  }

  if (screen.kind === "result") {
    const { myResult, opponentUsername } = screen;
    const opponentCorrect = myResult.opponentResult?.correctCount ?? 0;
    const opponentTotal = myResult.opponentResult?.totalPossible ?? myResult.totalPossible;
    const outcome =
      myResult.correctCount === opponentCorrect ? "tied" : myResult.correctCount > opponentCorrect ? "won" : "lost";

    return (
      <ArenaBackground className="flex-1 items-center justify-center gap-6 px-4">
        <Text className="font-display text-3xl text-arena-text">{t("resultHeading")}</Text>
        <Text
          className={`text-2xl font-bold ${outcome === "won" ? "text-arena-accent-2" : outcome === "lost" ? "text-red-300" : "text-arena-text-soft"}`}
        >
          {outcome === "won" ? t("youWon") : outcome === "lost" ? t("youLost") : t("tied")}
        </Text>
        <Text className="text-lg text-arena-text">{t("youScored", { correct: myResult.correctCount, total: myResult.totalPossible })}</Text>
        {opponentUsername && (
          <Text className="text-lg text-arena-text-soft">
            {t("opponentScored", { username: opponentUsername, correct: opponentCorrect, total: opponentTotal })}
          </Text>
        )}
        <ArenaPressable
          onPress={() => void rematch(screen.challenge, opponentUsername)}
          className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent px-8 py-5"
        >
          <Text className="text-lg font-bold text-[#2A1E00]">{t("rematch")}</Text>
        </ArenaPressable>
        <Pressable onPress={() => setScreen({ kind: "hub" })}>
          <Text className="text-arena-text-soft">{t("backToHub")}</Text>
        </Pressable>
      </ArenaBackground>
    );
  }

  return null;
}
