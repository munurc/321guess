import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  type ChallengeQuestion,
  type ChallengeRow,
  type FinishChallengeResult,
  type LinkInvite,
} from "../lib/challenge-api";
import { loadDataset } from "../lib/dataset";
import { phaseAfterJoin, shouldTryJoinOnOpen } from "../lib/invite-flow";
import { localizedPath } from "../lib/localized-path";
import { registerPlayer } from "../lib/online-api";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "../lib/online-storage";
import { useScrollToEndOnKeyboard } from "../lib/use-scroll-to-end-on-keyboard";
import { ArenaBackground } from "./ArenaBackground";
import { ArenaPressable } from "./ArenaPressable";
import { Countdown } from "./Countdown";
import { LogoTile } from "./LogoTile";
import { GuessInput, RoundPlayView } from "./RoundPlayView";

type UsernameError = "format" | "blocked" | "taken" | "server" | "expired";

type Phase =
  | { kind: "loading" }
  | { kind: "inactive" }
  | { kind: "invite" }
  | { kind: "username" }
  | { kind: "own" }
  | { kind: "error" }
  | { kind: "countdown"; challenge: ChallengeRow }
  | { kind: "playing"; challenge: ChallengeRow }
  | { kind: "result"; result: FinishChallengeResult };

const isWeb = Platform.OS === "web";

// The website keeps its light "paper" look; the app keeps the arena theme.
// Same flow, two skins.
const ui = isWeb
  ? {
      title: "text-2xl font-black text-ink",
      body: "text-base text-ink-soft",
      soft: "text-sm text-ink-mute",
      accent: "text-base font-semibold text-accent",
      brand: "text-2xl font-black text-accent",
      error: "text-sm text-red-600",
      input: "rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink",
      button: "items-center rounded-xl bg-accent py-4",
      buttonText: "text-lg font-bold text-paper",
      won: "text-accent",
      lost: "text-red-600",
      tied: "text-ink-mute",
    }
  : {
      title: "text-2xl font-bold text-arena-text",
      body: "text-xl text-arena-text",
      soft: "text-sm text-arena-text-soft",
      accent: "text-lg text-arena-accent-2",
      brand: "font-display text-3xl text-arena-accent",
      error: "text-sm text-red-400",
      input: "rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text",
      button: "items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6",
      buttonText: "text-2xl font-bold text-[#2A1E00]",
      won: "text-arena-accent-2",
      lost: "text-red-300",
      tied: "text-arena-text-soft",
    };

function Surface({ children }: { children: ReactNode }) {
  return isWeb ? <View className="flex-1 bg-paper">{children}</View> : <ArenaBackground className="flex-1">{children}</ArenaBackground>;
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <ArenaPressable onPress={onPress} disabled={disabled} className={`${ui.button} ${disabled ? "opacity-60" : ""}`}>
      <Text className={ui.buttonText}>{label}</Text>
    </ArenaPressable>
  );
}

/** /m/[code]: a friend opens a creator's invite link (web or app), creates a
 * username if needed, plays the creator's exact questions after the 3-2-1
 * countdown, and sees a 1-to-1 result. */
export function InviteScreen({ code }: { code: string }) {
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
  useScrollToEndOnKeyboard(playScrollRef, !isWeb && phase.kind === "playing");
  const guessedIds = useMemo(() => new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id)), [foundPlayers, wrongPlayers]);

  useEffect(() => {
    loadDataset().then(setDataset).catch(() => {});
    Promise.all([fetchLinkInvite(code), loadIdentity()]).then(([res, id]) => {
      setIdentity(id);
      if (res.status === "ok") setInvite(res.data);
      const next = shouldTryJoinOnOpen(res, id);
      if (next !== "rejoin") setPhase({ kind: next });
      else if (id) void join(id);
    });
    // One-shot open per code; join reads only its argument and code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function join(id: Identity) {
    setJoining(true);
    const outcome = phaseAfterJoin(await joinLink(id.token, code));
    setJoining(false);
    if (outcome.kind === "load-result") {
      // Already played: finish is idempotent and returns the stored result,
      // so a reopen lands on the result, never a replay.
      const finished = await finishChallenge(id.token, outcome.challenge.id);
      setPhase(finished.status === "ok" ? { kind: "result", result: finished.data } : { kind: "error" });
    } else if (outcome.kind === "username") {
      // The stored identity no longer exists on the server: start over.
      await clearIdentity();
      setIdentity(null);
      setUsernameError(outcome.error);
      setPhase({ kind: "username" });
    } else if (outcome.kind === "countdown") {
      setPhase({ kind: "countdown", challenge: outcome.challenge });
    } else {
      setPhase({ kind: outcome.kind });
    }
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
    if (!identity || guessedIds.has(player.id)) return;
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
    setPhase(res.status === "ok" ? { kind: "result", result: res.data } : { kind: "error" });
  }

  const goHome = () => router.replace(localizedPath(isWeb ? "/" : "/challenge", locale) as never);
  const container = { paddingTop: insets.top + (isWeb ? 32 : 24), paddingBottom: insets.bottom + 32 };
  const scrollClass = `flex-1 ${isWeb ? "px-4" : "px-6"}`;
  const contentClass = `gap-6 ${isWeb ? "mx-auto w-full max-w-md" : ""}`;

  if (phase.kind === "countdown") {
    return (
      <Surface>
        <Countdown onDone={() => setPhase({ kind: "playing", challenge: phase.challenge })} />
      </Surface>
    );
  }

  if (phase.kind === "playing") {
    const challenge = phase.challenge;
    const question = challenge.questions[questionIndex];
    return (
      <Surface>
        <ScrollView
          ref={playScrollRef}
          className={scrollClass}
          contentContainerClassName={contentClass}
          contentContainerStyle={container}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {!dataset || !question ? (
            <Text className={ui.soft}>{tc("loading")}</Text>
          ) : (
            <>
              <Text className={ui.soft}>
                {questionIndex + 1} / {challenge.questions.length}
              </Text>
              {isWeb ? (
                <>
                  <WebQuestion question={question} foundCount={foundPlayers.length} />
                  <GuessInput
                    players={dataset.players}
                    excludedIds={guessedIds}
                    onGuess={(p) => void submitGuess(challenge, p)}
                    placeholder={tc("guessPlaceholder")}
                    emptyText={tc("guessEmpty")}
                  />
                  <WebGuessChips found={foundPlayers} wrong={wrongPlayers} feedback={guessFeedback} />
                </>
              ) : (
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
              )}
              <Button label="→" onPress={() => void nextQuestion(challenge)} />
            </>
          )}
        </ScrollView>
      </Surface>
    );
  }

  return (
    <Surface>
      <ScrollView className={scrollClass} contentContainerClassName={contentClass} contentContainerStyle={container}>
        <Text className={ui.brand}>321guess</Text>

        {phase.kind === "loading" && <Text className={ui.soft}>{tc("loading")}</Text>}

        {phase.kind === "error" && (
          <>
            <Text className={ui.body}>{tu("error.server")}</Text>
            <Button label={t("retry")} onPress={() => (identity ? void join(identity) : setPhase({ kind: "invite" }))} />
          </>
        )}

        {phase.kind === "inactive" && (
          <>
            <Text className={ui.body}>{t("inactive")}</Text>
            <Button label={t("goHome")} onPress={goHome} />
          </>
        )}

        {phase.kind === "own" && invite && (
          <>
            <Text className={ui.body}>{t("own")}</Text>
            <Text className={ui.accent}>{tc("linkRow", { count: invite.playedCount })}</Text>
            <Button label={t("goHome")} onPress={goHome} />
          </>
        )}

        {phase.kind === "invite" && invite && (
          <>
            <Text className={ui.title}>{t("title", { username: invite.creatorUsername })}</Text>
            <Text className={ui.accent}>
              {t("score", { correct: invite.creatorScore.correctCount, total: invite.creatorScore.totalPossible })}
            </Text>
            <Button label={t("start")} onPress={start} disabled={joining} />
            {isWeb && (
              <Pressable onPress={() => void Linking.openURL(`guess321://m/${code}`)} className="items-center py-2">
                <Text className={`${ui.soft} underline`}>{t("openInApp")}</Text>
              </Pressable>
            )}
          </>
        )}

        {phase.kind === "username" && (
          <View className="gap-4">
            <Text className={ui.title}>{tu("label")}</Text>
            <TextInput
              value={usernameInput}
              onChangeText={(v) => {
                setUsernameInput(v);
                setUsernameError(null);
              }}
              placeholder={tu("placeholder")}
              placeholderTextColor={isWeb ? undefined : "#8FE8C4"}
              maxLength={20}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={() => void handleRegister()}
              className={ui.input}
            />
            {usernameError && <Text className={ui.error}>{tu(`error.${usernameError}`)}</Text>}
            <Text className={ui.soft}>{tu("hint")}</Text>
            <Button
              label={registering ? tu("submitting") : tu("submit")}
              onPress={() => void handleRegister()}
              disabled={registering || joining || usernameInput.trim().length === 0}
            />
          </View>
        )}

        {phase.kind === "result" && <InviteResult result={phase.result} />}
      </ScrollView>
    </Surface>
  );
}

/** Web question card, matching the website's Daily Challenge look. */
function WebQuestion({ question, foundCount }: { question: ChallengeQuestion; foundCount: number }) {
  return (
    <View className="rounded-2xl border-2 border-rule bg-ink/5 px-4 pb-4 pt-4">
      <View className="flex-row items-center justify-center gap-4">
        <LogoTile size="sm" src={question.clubA.logoUrl} alt={question.clubA.name} caption={question.clubA.name} />
        <Text className="text-xs font-black text-ink-mute">×</Text>
        <LogoTile size="sm" src={question.clubB.logoUrl} alt={question.clubB.name} caption={question.clubB.name} />
      </View>
      <View className="mt-3 flex-row flex-wrap justify-center gap-1.5">
        {Array.from({ length: question.totalPossible }).map((_, i) => (
          <View key={i} className={`h-2.5 w-2.5 rounded-full border border-accent ${i < foundCount ? "bg-accent" : ""}`} />
        ))}
      </View>
    </View>
  );
}

function WebGuessChips({
  found,
  wrong,
  feedback,
}: {
  found: Player[];
  wrong: Player[];
  feedback: { status: "correct" | "wrong"; label: string } | null;
}) {
  return (
    <>
      {feedback && (
        <View className={`rounded-lg px-3 py-2 ${feedback.status === "correct" ? "bg-accent/15" : "bg-red-500/10"}`}>
          <Text className={feedback.status === "correct" ? "text-accent" : "text-red-600"}>
            {feedback.status === "correct" ? "✓" : "✗"} {feedback.label}
          </Text>
        </View>
      )}
      {(found.length > 0 || wrong.length > 0) && (
        <View className="flex-row flex-wrap gap-2">
          {found.map((p) => (
            <View key={p.id} className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1">
              <Text className="text-xs font-medium text-ink">{p.name}</Text>
            </View>
          ))}
          {wrong.map((p) => (
            <View key={p.id} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1">
              <Text className="text-xs font-medium text-red-600">✕ {p.name}</Text>
            </View>
          ))}
        </View>
      )}
    </>
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
      <Text className={ui.title}>{tc("resultHeading")}</Text>
      <Text className={`text-2xl font-bold ${ui[outcome]}`}>
        {outcome === "won" ? tc("youWon") : outcome === "lost" ? tc("youLost") : tc("tied")}
      </Text>
      <Text className={ui.body}>{tc("youScored", { correct: result.correctCount, total: result.totalPossible })}</Text>
      {opponent && (
        <Text className={ui.body}>
          {tc("opponentScored", { username: opponent.username, correct: opponent.correctCount, total: opponent.totalPossible })}
        </Text>
      )}
      {isWeb && <Text className={`mt-4 text-center ${ui.accent}`}>{t("appSoon")}</Text>}
    </View>
  );
}
