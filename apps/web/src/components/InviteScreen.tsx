import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";
import * as Crypto from "expo-crypto";
import { validateUsername, type Dataset, type Player } from "@321guess/core";
import {
  fetchLinkInvite,
  finishChallenge,
  joinLink,
  submitChallengeGuess,
  type ChallengeRow,
  type FinishChallengeResult,
  type LinkInvite,
} from "../lib/challenge-api";
import { loadDataset } from "../lib/dataset";
import { localizedPath } from "../lib/localized-path";
import { registerPlayer } from "../lib/online-api";
import { loadIdentity, saveIdentity, type Identity } from "../lib/online-storage";
import { useScrollToEndOnKeyboard } from "../lib/use-scroll-to-end-on-keyboard";
import { ArenaSurfaceContext } from "../lib/arena-surface";
import { ArenaBackground } from "./ArenaBackground";
import { ArenaPressable } from "./ArenaPressable";
import { Countdown } from "./Countdown";
import { RoundPlayView } from "./RoundPlayView";

type UsernameError = "format" | "blocked" | "taken" | "server";

type Phase =
  | { kind: "loading" }
  | { kind: "inactive" }
  | { kind: "invite" }
  | { kind: "username" }
  | { kind: "own" }
  | { kind: "countdown"; challenge: ChallengeRow }
  | { kind: "playing"; challenge: ChallengeRow }
  | { kind: "result"; result: FinishChallengeResult };

/** /m/[code]: a friend opens a creator's invite link (web or app), creates a
 * username if needed, plays the creator's exact questions after the 3-2-1
 * countdown, and sees a 1-to-1 result. Arena-themed on both platforms — it's
 * a game screen. */
export function InviteScreen({ code }: { code: string }) {
  return (
    <ArenaSurfaceContext.Provider value={true}>
      <InviteFlow code={code} />
    </ArenaSurfaceContext.Provider>
  );
}

function InviteFlow({ code }: { code: string }) {
  const t = useTranslations("invite");
  const tc = useTranslations("challenge");
  const tu = useTranslations("online.username");
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [invite, setInvite] = useState<LinkInvite | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<UsernameError | null>(null);
  const [registering, setRegistering] = useState(false);
  const [joining, setJoining] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
  const [wrongPlayers, setWrongPlayers] = useState<Player[]>([]);
  const [celebrationTick, setCelebrationTick] = useState(0);
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);
  const feedbackIdRef = useRef(0);
  const playScrollRef = useRef<ScrollView>(null);
  useScrollToEndOnKeyboard(playScrollRef, Platform.OS !== "web" && phase.kind === "playing");

  useEffect(() => {
    loadDataset().then(setDataset).catch(() => {});
    Promise.all([fetchLinkInvite(code), loadIdentity()]).then(([res, id]) => {
      setIdentity(id);
      if (res.status !== "ok" || !res.data.active) {
        setPhase({ kind: "inactive" });
        return;
      }
      setInvite(res.data);
      setPhase({ kind: "invite" });
    });
  }, [code]);

  async function join(id: Identity) {
    setJoining(true);
    const res = await joinLink(id.token, code);
    setJoining(false);
    if (res.status === "gone") return setPhase({ kind: "inactive" });
    if (res.status === "own") return setPhase({ kind: "own" });
    if (res.status !== "ok") return;
    const challenge = res.data;
    if (challenge.status === "completed") {
      // Already played this link: finish is idempotent and returns the
      // stored result, so a reopen lands on the result, never a replay.
      const finished = await finishChallenge(id.token, challenge.id);
      if (finished.status === "ok") setPhase({ kind: "result", result: finished.data });
      return;
    }
    setPhase({ kind: "countdown", challenge });
  }

  function start() {
    if (identity) void join(identity);
    else setPhase({ kind: "username" });
  }

  async function handleRegister() {
    const trimmed = usernameInput.trim();
    const validation = validateUsername(trimmed);
    if (!validation.valid) return setUsernameError(validation.reason);
    setRegistering(true);
    setUsernameError(null);
    const token = Crypto.randomUUID();
    const res = await registerPlayer(trimmed, token);
    setRegistering(false);
    if (!res.ok) return setUsernameError(res.reason);
    const newIdentity: Identity = { token, username: res.username };
    await saveIdentity(newIdentity);
    setIdentity(newIdentity);
    void join(newIdentity);
  }

  function flashGuessFeedback(status: "correct" | "wrong", label: string) {
    const id = ++feedbackIdRef.current;
    setGuessFeedback({ id, status, label });
    setTimeout(() => setGuessFeedback((cur) => (cur?.id === id ? null : cur)), 1100);
  }

  async function submitGuess(challenge: ChallengeRow, player: Player) {
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

  async function nextQuestion(challenge: ChallengeRow) {
    const next = questionIndex + 1;
    if (next < challenge.questions.length) {
      setQuestionIndex(next);
      setFoundPlayers([]);
      setWrongPlayers([]);
      setGuessFeedback(null);
      return;
    }
    if (!identity) return;
    const res = await finishChallenge(identity.token, challenge.id);
    if (res.status === "ok") setPhase({ kind: "result", result: res.data });
  }

  const goHome = () => router.replace(localizedPath(Platform.OS === "web" ? "/" : "/challenge", locale) as never);
  const container = { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 };

  if (phase.kind === "countdown") {
    return (
      <ArenaBackground className="flex-1">
        <Countdown onDone={() => setPhase({ kind: "playing", challenge: phase.challenge })} />
      </ArenaBackground>
    );
  }

  if (phase.kind === "playing") {
    const challenge = phase.challenge;
    const question = challenge.questions[questionIndex];
    if (!dataset || !question) {
      return (
        <ArenaBackground className="flex-1 items-center justify-center">
          <Text className="text-arena-text-soft">{tc("loading")}</Text>
        </ArenaBackground>
      );
    }
    return (
      <ArenaBackground className="flex-1">
        <ScrollView
          ref={playScrollRef}
          className="flex-1 px-4"
          contentContainerClassName="gap-4"
          contentContainerStyle={container}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text className="text-sm text-arena-text-soft">
            {questionIndex + 1} / {challenge.questions.length}
          </Text>
          <RoundPlayView
            question={{ clubA: question.clubA, clubB: question.clubB, totalPossible: question.totalPossible }}
            foundPlayers={foundPlayers}
            wrongPlayers={wrongPlayers}
            players={dataset.players}
            celebrationTick={celebrationTick}
            guessFeedback={guessFeedback}
            onGuess={(p) => void submitGuess(challenge, p)}
            vsLabel="×"
            possibleCountLabel=""
            guessPlaceholder={tc("guessPlaceholder")}
            guessEmptyText={tc("guessEmpty")}
          />
          <ArenaPressable
            onPress={() => void nextQuestion(challenge)}
            className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
          >
            <Text className="text-xl font-bold text-[#2A1E00]">→</Text>
          </ArenaPressable>
        </ScrollView>
      </ArenaBackground>
    );
  }

  return (
    <ArenaBackground className="flex-1">
      <ScrollView className="flex-1 px-6" contentContainerClassName="gap-6" contentContainerStyle={container}>
        <Text className="font-display text-3xl text-arena-accent">321guess</Text>

        {phase.kind === "loading" && <Text className="text-arena-text-soft">{tc("loading")}</Text>}

        {phase.kind === "inactive" && (
          <>
            <Text className="text-xl text-arena-text">{t("inactive")}</Text>
            <ArenaPressable onPress={goHome} className="items-center rounded-2xl bg-arena-accent py-5">
              <Text className="text-lg font-bold text-[#2A1E00]">{t("goHome")}</Text>
            </ArenaPressable>
          </>
        )}

        {phase.kind === "own" && invite && (
          <>
            <Text className="text-xl text-arena-text">{t("own")}</Text>
            <Text className="text-lg text-arena-accent-2">{tc("linkRow", { count: invite.playedCount })}</Text>
            <ArenaPressable onPress={goHome} className="items-center rounded-2xl bg-arena-accent py-5">
              <Text className="text-lg font-bold text-[#2A1E00]">{t("goHome")}</Text>
            </ArenaPressable>
          </>
        )}

        {phase.kind === "invite" && invite && (
          <>
            <Text className="text-2xl font-bold text-arena-text">
              {t("title", { username: invite.creatorUsername })}
            </Text>
            <Text className="text-lg text-arena-accent-2">
              {t("score", { correct: invite.creatorScore.correctCount, total: invite.creatorScore.totalPossible })}
            </Text>
            <ArenaPressable
              onPress={start}
              disabled={joining}
              className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
            >
              <Text className="text-2xl font-bold text-[#2A1E00]">{t("start")}</Text>
            </ArenaPressable>
            {Platform.OS === "web" && (
              <Pressable onPress={() => void Linking.openURL(`guess321://m/${code}`)} className="items-center py-2">
                <Text className="text-base text-arena-text-soft underline">{t("openInApp")}</Text>
              </Pressable>
            )}
          </>
        )}

        {phase.kind === "username" && (
          <View className="gap-4">
            <Text className="text-base font-semibold text-arena-text">{tu("label")}</Text>
            <TextInput
              value={usernameInput}
              onChangeText={(v) => {
                setUsernameInput(v);
                setUsernameError(null);
              }}
              placeholder={tu("placeholder")}
              placeholderTextColor="#8FE8C4"
              maxLength={20}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={() => void handleRegister()}
              className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text"
            />
            {usernameError && <Text className="text-sm text-red-400">{tu(`error.${usernameError}`)}</Text>}
            <Text className="text-sm text-arena-text-soft">{tu("hint")}</Text>
            <ArenaPressable
              onPress={() => void handleRegister()}
              disabled={registering || joining || usernameInput.trim().length === 0}
              className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
            >
              <Text className="text-2xl font-bold text-[#2A1E00]">
                {registering ? tu("submitting") : tu("submit")}
              </Text>
            </ArenaPressable>
          </View>
        )}

        {phase.kind === "result" && <InviteResult result={phase.result} />}
      </ScrollView>
    </ArenaBackground>
  );
}

function InviteResult({ result }: { result: FinishChallengeResult }) {
  const t = useTranslations("invite");
  const tc = useTranslations("challenge");
  const opponent = result.opponentResult;
  const opponentCorrect = opponent?.correctCount ?? 0;
  const outcome =
    result.correctCount === opponentCorrect ? "tied" : result.correctCount > opponentCorrect ? "won" : "lost";
  return (
    <View className="items-center gap-4">
      <Text className="font-display text-3xl text-arena-text">{tc("resultHeading")}</Text>
      <Text
        className={`text-2xl font-bold ${outcome === "won" ? "text-arena-accent-2" : outcome === "lost" ? "text-red-300" : "text-arena-text-soft"}`}
      >
        {outcome === "won" ? tc("youWon") : outcome === "lost" ? tc("youLost") : tc("tied")}
      </Text>
      <Text className="text-lg text-arena-text">{tc("youScored", { correct: result.correctCount, total: result.totalPossible })}</Text>
      {opponent && (
        <Text className="text-lg text-arena-text-soft">
          {tc("opponentScored", { username: opponent.username, correct: opponent.correctCount, total: opponent.totalPossible })}
        </Text>
      )}
      {Platform.OS === "web" && <Text className="mt-4 text-center text-base text-arena-accent-2">{t("appSoon")}</Text>}
    </View>
  );
}
