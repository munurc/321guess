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
import { LanguageSwitcher } from "./LanguageSwitcher";
import { GuessInput, RoundPlayView } from "./RoundPlayView";
import { ThemeToggle } from "./ThemeToggle";

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

// The app's arena skin. The website renders its own tree (WebInvite below)
// with the site's shared header and paper/ink tokens.
const ui = {
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
  return <ArenaBackground className="flex-1">{children}</ArenaBackground>;
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
  const to = useTranslations("online");
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

  if (isWeb) {
    const heading =
      invite && (phase.kind === "invite" || phase.kind === "username") ? (
        <>
          <Text className="text-2xl font-black text-accent">{t("title", { username: invite.creatorUsername })}</Text>
          <Text className="mb-6 mt-1 text-sm text-ink-mute">
            {t("score", { correct: invite.creatorScore.correctCount, total: invite.creatorScore.totalPossible })}
          </Text>
        </>
      ) : null;
    const challenge = phase.kind === "playing" ? phase.challenge : null;
    const question = challenge?.questions[questionIndex];

    return (
      <ScrollView className="flex-1 bg-paper px-4 py-8" contentContainerClassName="pb-8" keyboardShouldPersistTaps="handled">
        <View className="mb-8 flex-row items-center justify-between">
          <Pressable onPress={goHome}>
            <Text className="text-3xl font-black text-ink">
              <Text className="text-accent">3·2·1</Text>guess
            </Text>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </View>
        </View>

        {heading}

        {phase.kind === "loading" && <WebLoadingBox text={tc("loading")} />}

        {phase.kind === "error" && (
          <View className="gap-4">
            <WebLoadingBox text={tu("error.server")} />
            <WebButton label={t("retry")} onPress={() => (identity ? void join(identity) : setPhase({ kind: "invite" }))} />
          </View>
        )}

        {phase.kind === "inactive" && (
          <View className="gap-4">
            <WebLoadingBox text={t("inactive")} />
            <WebButton label={t("goHome")} onPress={goHome} />
          </View>
        )}

        {phase.kind === "own" && invite && (
          <View className="gap-4">
            <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
              <Text className="text-ink">{t("own")}</Text>
              <Text className="mt-2 text-sm font-semibold text-accent">{tc("linkRow", { count: invite.playedCount })}</Text>
            </View>
            <WebButton label={t("goHome")} onPress={goHome} />
          </View>
        )}

        {phase.kind === "invite" && invite && (
          <View className="gap-3">
            <WebButton label={t("start")} onPress={start} disabled={joining} />
            <Pressable onPress={() => void Linking.openURL(`guess321://m/${code}`)} className="items-center py-2">
              <Text className="text-xs text-ink-mute underline">{t("openInApp")}</Text>
            </Pressable>
          </View>
        )}

        {phase.kind === "username" && (
          <View className="gap-3">
            <Text className="text-sm font-semibold text-ink-soft">{tu("label")}</Text>
            <TextInput
              value={usernameInput}
              onChangeText={(v) => {
                setUsernameInput(v);
                setUsernameError(null);
              }}
              placeholder={tu("placeholder")}
              maxLength={20}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={() => void handleRegister()}
              className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
            />
            {usernameError && <Text className="text-xs text-red-500">{tu(`error.${usernameError}`)}</Text>}
            <Text className="text-xs text-ink-mute">{tu("hint")}</Text>
            <WebButton
              label={registering ? tu("submitting") : tu("submit")}
              onPress={() => void handleRegister()}
              disabled={registering || joining || usernameInput.trim().length === 0}
            />
          </View>
        )}

        {phase.kind === "countdown" && (
          <Countdown onDone={() => setPhase({ kind: "playing", challenge: phase.challenge })} />
        )}

        {challenge &&
          (!dataset || !question ? (
            <WebLoadingBox text={tc("loading")} />
          ) : (
            <View className="gap-4">
              <Text className="text-xs text-ink-mute">
                {to("questionProgress", { current: questionIndex + 1, total: challenge.questions.length })}
              </Text>

              <View className="rounded-2xl border-2 border-rule bg-ink/5 px-4 pb-4 pt-4">
                <View className="flex-row items-center justify-center gap-4">
                  <LogoTile size="sm" src={question.clubA.logoUrl} alt={question.clubA.name} caption={question.clubA.name} />
                  <Text className="text-xs font-black text-ink-mute">{to("vs")}</Text>
                  <LogoTile size="sm" src={question.clubB.logoUrl} alt={question.clubB.name} caption={question.clubB.name} />
                </View>
                <View className="mt-3 items-center gap-1.5">
                  <Text className="text-[11px] text-ink-mute">{to("possibleCount", { count: question.totalPossible })}</Text>
                  <View className="flex-row flex-wrap justify-center gap-1.5">
                    {Array.from({ length: question.totalPossible }).map((_, i) => (
                      <View
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full border border-accent ${i < foundPlayers.length ? "bg-accent" : ""}`}
                      />
                    ))}
                  </View>
                </View>
              </View>

              <GuessInput
                players={dataset.players}
                excludedIds={guessedIds}
                onGuess={(p) => void submitGuess(challenge, p)}
                placeholder={tc("guessPlaceholder")}
                emptyText={tc("guessEmpty")}
              />

              {guessFeedback && (
                <View
                  className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
                    guessFeedback.status === "correct" ? "bg-accent/15" : "bg-red-500/10"
                  }`}
                >
                  <Text className={guessFeedback.status === "correct" ? "text-accent" : "text-red-600"}>
                    {guessFeedback.status === "correct" ? "✓" : "✗"} {guessFeedback.label}
                  </Text>
                </View>
              )}

              {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
                <View className="flex-row flex-wrap gap-2">
                  {foundPlayers.map((p) => (
                    <View key={p.id} className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1">
                      <Text className="text-xs font-medium text-ink">{p.name}</Text>
                    </View>
                  ))}
                  {wrongPlayers.map((p) => (
                    <View key={p.id} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1">
                      <Text className="text-xs font-medium text-red-600">✕ {p.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable onPress={() => void nextQuestion(challenge)} className="items-center rounded-xl bg-accent py-3">
                <Text className="text-sm font-bold text-paper">{foundPlayers.length > 0 ? to("nextQuestion") : to("pass")}</Text>
              </Pressable>
            </View>
          ))}

        {phase.kind === "result" && <WebInviteResult result={phase.result} username={identity?.username ?? ""} onHome={goHome} />}
      </ScrollView>
    );
  }

  const container = { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 };
  const scrollClass = "flex-1 px-6";
  const contentClass = "gap-6";

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
              placeholderTextColor="#8FE8C4"
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

function WebButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className={`items-center rounded-xl py-4 ${disabled ? "bg-ink/10" : "bg-accent"}`}>
      <Text className={`text-lg font-bold ${disabled ? "text-ink-mute" : "text-paper"}`}>{label}</Text>
    </Pressable>
  );
}

function WebLoadingBox({ text }: { text: string }) {
  return (
    <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
      <Text className="text-center text-ink-mute">{text}</Text>
    </View>
  );
}

/** The website's result card, matching the Daily Challenge result: outcome on
 * top, then both scores as leaderboard-style rows with the viewer
 * highlighted. */
function WebInviteResult({ result, username, onHome }: { result: FinishChallengeResult; username: string; onHome: () => void }) {
  const t = useTranslations("invite");
  const tc = useTranslations("challenge");
  const opponent = result.opponentResult;
  const opponentCorrect = opponent?.correctCount ?? 0;
  const outcome =
    result.correctCount === opponentCorrect ? "tied" : result.correctCount > opponentCorrect ? "won" : "lost";
  const rows = [
    { name: username, correct: result.correctCount, total: result.totalPossible, me: true },
    ...(opponent ? [{ name: opponent.username, correct: opponent.correctCount, total: opponent.totalPossible, me: false }] : []),
  ];
  return (
    <View className="gap-6">
      <View className="items-center rounded-xl border-2 border-accent bg-accent/10 p-6">
        <Text className="text-3xl font-black text-ink">
          {outcome === "won" ? tc("youWon") : outcome === "lost" ? tc("youLost") : tc("tied")}
        </Text>
        <Text className="mt-1 text-sm text-ink-mute">{tc("resultHeading")}</Text>
      </View>

      <View className="gap-1">
        {rows.map((row) => (
          <View
            key={row.name}
            className={`flex-row items-center justify-between rounded-lg px-3 py-2 ${
              row.me ? "border border-accent/40 bg-accent/10" : "bg-ink/5"
            }`}
          >
            <Text className={row.me ? "font-semibold text-ink" : "text-ink"}>{row.name}</Text>
            <Text className="text-ink-soft">
              {row.correct} / {row.total}
            </Text>
          </View>
        ))}
      </View>

      <Text className="text-center text-sm font-semibold text-accent">{t("appSoon")}</Text>
      <Pressable onPress={onHome} className="items-center rounded-xl border border-rule py-3">
        <Text className="text-sm font-semibold text-ink-soft">{t("goHome")}</Text>
      </Pressable>
    </View>
  );
}

function InviteResult({ result }: { result: FinishChallengeResult }) {
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
    </View>
  );
}
