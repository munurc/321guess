import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import * as Crypto from "expo-crypto";
import type { Dataset, Player } from "@321guess/core";
import { validateUsername } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import {
  clearIdentity,
  loadIdentity,
  loadProgress,
  saveIdentity,
  saveProgress,
  type FinishResult,
  type Identity,
} from "../lib/online-storage";
import {
  fetchLeaderboard,
  fetchRound,
  finishRound as finishRoundApi,
  registerPlayer,
  startRound as startRoundApi,
  submitGuess as submitGuessApi,
  type LeaderboardResponse,
  type RoundInfo,
} from "../lib/online-api";
import { shareOrCopy } from "../lib/share";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoTile } from "./LogoTile";
import { ThemeToggle } from "./ThemeToggle";

const ROUND_DURATION_MS = 1 * 60 * 1000;
const LAUNCH_DATE = "2026-08-05";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}
function dayNumber(roundDate: string): number {
  const start = new Date(`${LAUNCH_DATE}T00:00:00Z`).getTime();
  const current = new Date(`${roundDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((current - start) / 86_400_000) + 1);
}
function scoreBar(correct: number): string {
  const filled = Math.max(0, Math.min(10, correct));
  return "🟩".repeat(filled) + "⬜".repeat(10 - filled);
}
function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function computeBadges(result: FinishResult): string[] {
  const badges: string[] = [];
  if (result.totalPossible > 0 && result.correctCount === result.totalPossible) badges.push("perfect");
  if (result.currentStreak >= 30) badges.push("streak30");
  else if (result.currentStreak >= 7) badges.push("streak7");
  else if (result.currentStreak >= 3) badges.push("streak3");
  return badges;
}

export function OnlineScreen() {
  const t = useTranslations("online");
  const locale = useLocale();
  const router = useRouter();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [roundLoadFailed, setRoundLoadFailed] = useState(false);

  const [phase, setPhase] = useState<"matchup" | "playing" | "finished">("matchup");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
  const [wrongPlayers, setWrongPlayers] = useState<Player[]>([]);
  const [overallFoundCount, setOverallFoundCount] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [result, setResult] = useState<FinishResult | null>(null);

  const [leaderboardTab, setLeaderboardTab] = useState<"today" | "total">("today");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied">("idle");
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const feedbackIdRef = useRef(0);

  function flashGuessFeedback(status: "correct" | "wrong", label: string) {
    const id = ++feedbackIdRef.current;
    setGuessFeedback({ id, status, label });
    setTimeout(() => {
      setGuessFeedback((current) => (current?.id === id ? null : current));
    }, 1100);
  }

  useEffect(() => {
    loadIdentity().then((id) => {
      setIdentity(id);
      setIdentityLoaded(true);
    });
    loadDataset().then(setDataset);
  }, []);

  useEffect(() => {
    if (!identityLoaded || !identity) return;
    fetchRound().then((data) => {
      if (data) setRound(data);
      else setRoundLoadFailed(true);
    });
  }, [identityLoaded, identity]);

  useEffect(() => {
    if (!round || !dataset) return;
    loadProgress(round.roundDate).then((saved) => {
      if (!saved) return;
      if (saved.finished) {
        setResult(saved.result);
        setPhase("finished");
        return;
      }
      const byId = new Map(dataset.players.map((p) => [p.id, p] as const));
      setQuestionIndex(saved.questionIndex ?? 0);
      setFoundPlayers((saved.foundPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
      setWrongPlayers((saved.wrongPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
      setOverallFoundCount(saved.overallFoundCount ?? 0);
      const startedAt = saved.startedAt ?? Date.now();
      const elapsed = Date.now() - startedAt;
      startTimeRef.current = startedAt;
      setTimeLeftMs(Math.max(0, ROUND_DURATION_MS - elapsed));
      setPhase("playing");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, dataset]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setTimeLeftMs((prev) => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && timeLeftMs <= 0) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeftMs]);

  useEffect(() => {
    if (phase !== "finished") return;
    fetchLeaderboard(leaderboardTab).then(setLeaderboard);
  }, [phase, leaderboardTab]);

  async function handleRegister() {
    const trimmed = usernameInput.trim();
    const validation = validateUsername(trimmed);
    if (!validation.valid) {
      setUsernameError(validation.reason);
      return;
    }
    setRegistering(true);
    setUsernameError(null);
    const token = Crypto.randomUUID();
    const res = await registerPlayer(trimmed, token);
    if (!res.ok) {
      setUsernameError(res.reason);
      setRegistering(false);
      return;
    }
    const newIdentity: Identity = { token, username: res.username };
    await saveIdentity(newIdentity);
    setIdentity(newIdentity);
    setRegistering(false);
  }

  async function handleExpiredIdentity() {
    await clearIdentity();
    setIdentity(null);
    setRound(null);
    setPhase("matchup");
    setResult(null);
    setUsernameError("expired");
  }

  async function startRound() {
    if (!round || !identity) return;
    const outcome = await startRoundApi(identity.token);
    if (outcome === "expired") {
      await handleExpiredIdentity();
      return;
    }
    startTimeRef.current = Date.now();
    setPhase("playing");
    setQuestionIndex(0);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setOverallFoundCount(0);
    setTimeLeftMs(ROUND_DURATION_MS);
    await saveProgress(round.roundDate, {
      finished: false,
      questionIndex: 0,
      foundPlayerIds: [],
      wrongPlayerIds: [],
      overallFoundCount: 0,
      startedAt: startTimeRef.current,
    });
  }

  async function submitGuess(player: Player) {
    if (!identity || !round || foundPlayers.some((p) => p.id === player.id) || wrongPlayers.some((p) => p.id === player.id)) {
      return;
    }
    const res = await submitGuessApi(identity.token, questionIndex, player.id);
    if (res.status === "expired") {
      await handleExpiredIdentity();
      return;
    }
    if (res.status === "failed") return;
    if (res.correct) {
      flashGuessFeedback("correct", player.name);
      const next = [...foundPlayers, player];
      setFoundPlayers(next);
      setOverallFoundCount(res.overallFoundCount);
      await saveProgress(round.roundDate, {
        finished: false,
        questionIndex,
        foundPlayerIds: next.map((p) => p.id),
        wrongPlayerIds: wrongPlayers.map((p) => p.id),
        overallFoundCount: res.overallFoundCount,
        startedAt: startTimeRef.current ?? Date.now(),
      });
    } else {
      flashGuessFeedback("wrong", player.name);
      const next = [...wrongPlayers, player];
      setWrongPlayers(next);
      await saveProgress(round.roundDate, {
        finished: false,
        questionIndex,
        foundPlayerIds: foundPlayers.map((p) => p.id),
        wrongPlayerIds: next.map((p) => p.id),
        overallFoundCount,
        startedAt: startTimeRef.current ?? Date.now(),
      });
    }
  }

  async function goToNextQuestion() {
    if (!round) return;
    const next = questionIndex + 1;
    if (next >= round.questions.length) {
      await finish();
      return;
    }
    setQuestionIndex(next);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
    await saveProgress(round.roundDate, {
      finished: false,
      questionIndex: next,
      foundPlayerIds: [],
      wrongPlayerIds: [],
      overallFoundCount,
      startedAt: startTimeRef.current ?? Date.now(),
    });
  }

  async function finish() {
    if (finishingRef.current || !identity || !round) return;
    finishingRef.current = true;
    try {
      const res = await finishRoundApi(identity.token);
      if (res.status === "expired") {
        await handleExpiredIdentity();
        return;
      }
      if (res.status === "ok") {
        setResult(res.result);
        setPhase("finished");
        await saveProgress(round.roundDate, { finished: true, result: res.result });
      }
    } finally {
      finishingRef.current = false;
    }
  }

  const badges = useMemo(() => (result ? computeBadges(result) : []), [result]);
  const currentQuestion = round?.questions[questionIndex] ?? null;

  function shareText(): string {
    if (!result || !round) return "";
    return t("shareText", {
      day: dayNumber(round.roundDate),
      correct: result.correctCount,
      total: result.totalPossible,
      bar: scoreBar(result.correctCount),
      streak: result.currentStreak,
      url: `https://www.321guess.com/${locale}/online`,
    });
  }

  async function handleShare() {
    const text = shareText();
    if (!text) return;
    const outcome = await shareOrCopy(text);
    if (outcome === "copied") {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    }
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/")}>
          <Text className="text-xs uppercase tracking-wider text-ink-mute">← {t("backHome")}</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      <Text className="text-2xl font-black text-accent">{t("title")}</Text>
      <Text className="mb-6 mt-1 text-sm text-ink-mute">{t("description")}</Text>

      {!identityLoaded ? (
        <LoadingBox text={t("loading")} />
      ) : !identity ? (
        <View className="gap-3">
          <Text className="text-sm font-semibold text-ink-soft">{t("username.label")}</Text>
          <TextInput
            value={usernameInput}
            onChangeText={(v) => {
              setUsernameInput(v);
              setUsernameError(null);
            }}
            placeholder={t("username.placeholder")}
            maxLength={20}
            autoCapitalize="none"
            className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
          />
          {usernameError && <Text className="text-xs text-red-500">{t(`username.error.${usernameError}`)}</Text>}
          <Text className="text-xs text-ink-mute">{t("username.hint")}</Text>
          <Pressable
            onPress={handleRegister}
            disabled={registering || usernameInput.trim().length === 0}
            className={`items-center rounded-xl py-4 ${
              registering || usernameInput.trim().length === 0 ? "bg-ink/10" : "bg-accent"
            }`}
          >
            <Text
              className={`text-lg font-bold ${
                registering || usernameInput.trim().length === 0 ? "text-ink-mute" : "text-paper"
              }`}
            >
              {registering ? t("username.submitting") : t("username.submit")}
            </Text>
          </Pressable>
        </View>
      ) : roundLoadFailed ? (
        <LoadingBox text={t("roundError")} />
      ) : !round || !dataset ? (
        <LoadingBox text={t("loading")} />
      ) : phase === "matchup" ? (
        <View className="gap-6">
          <Text className="text-sm text-ink-mute">{t("welcomeBack", { username: identity.username })}</Text>
          <View className="gap-3">
            <Text className="text-center text-xs font-semibold uppercase tracking-wider text-ink-mute">
              {t("todaysMatchupsLabel")}
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {round.questions.map((q) => (
                <View key={q.index} className="flex-row items-center gap-1.5 rounded-xl border border-rule bg-ink/5 p-2">
                  <LogoTile size="sm" src={q.clubA.logoUrl} alt={q.clubA.name} caption="" />
                  <Text className="text-[10px] font-bold text-ink-mute">×</Text>
                  <LogoTile size="sm" src={q.clubB.logoUrl} alt={q.clubB.name} caption="" />
                </View>
              ))}
            </View>
          </View>
          <Text className="text-center text-xs text-ink-mute">
            {t("instructions", { minutes: ROUND_DURATION_MS / 60000, questions: round.questions.length })}
          </Text>
          <Pressable onPress={() => void startRound()} className="items-center rounded-xl bg-accent py-4">
            <Text className="text-lg font-bold text-paper">{t("start")}</Text>
          </Pressable>
        </View>
      ) : phase === "playing" && currentQuestion ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-ink-mute">
              {t("questionProgress", { current: questionIndex + 1, total: round.questions.length })}
            </Text>
            <Text className="text-xs text-ink-mute">
              {t("foundCount", { found: overallFoundCount, total: round.totalPossible })}
            </Text>
          </View>

          <View className="rounded-2xl border-2 border-rule bg-ink/5 px-4 pb-4 pt-3">
            <Text className="mb-2 self-end rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
              {formatTime(timeLeftMs)}
            </Text>
            <View className="flex-row items-center justify-center gap-4">
              <LogoTile size="sm" src={currentQuestion.clubA.logoUrl} alt={currentQuestion.clubA.name} caption={currentQuestion.clubA.name} />
              <Text className="text-xs font-black text-ink-mute">{t("vs")}</Text>
              <LogoTile size="sm" src={currentQuestion.clubB.logoUrl} alt={currentQuestion.clubB.name} caption={currentQuestion.clubB.name} />
            </View>
          </View>

          <GuessInput
            players={dataset.players}
            excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
            onGuess={submitGuess}
            placeholder={t("guessPlaceholder")}
            emptyText={t("guessEmpty")}
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
                  <Text className="text-xs font-medium">{p.name}</Text>
                </View>
              ))}
              {wrongPlayers.map((p) => (
                <View key={p.id} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1">
                  <Text className="text-xs font-medium text-red-600">✕ {p.name}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => void goToNextQuestion()} className="items-center rounded-xl bg-accent py-3">
            <Text className="text-sm font-bold text-paper">{foundPlayers.length > 0 ? t("nextQuestion") : t("pass")}</Text>
          </Pressable>
          <Pressable onPress={() => void finish()} className="items-center rounded-xl border border-rule py-3">
            <Text className="text-sm font-semibold text-ink-soft">{t("finishEarly")}</Text>
          </Pressable>
        </View>
      ) : result ? (
        <View className="gap-6">
          <View className="items-center rounded-xl border-2 border-accent bg-accent/10 p-6">
            <Text className="text-3xl font-black">
              {result.correctCount} / {result.totalPossible}
            </Text>
            <Text className="mt-1 text-sm text-ink-mute">{t("resultLabel")}</Text>
            {result.currentStreak > 0 && (
              <Text className="mt-3 text-sm font-semibold text-accent">
                🔥 {t("streakLabel", { count: result.currentStreak })}
              </Text>
            )}
          </View>

          {badges.length > 0 && (
            <View className="flex-row flex-wrap justify-center gap-2">
              {badges.map((badge) => (
                <View key={badge} className="rounded-full border border-rule bg-ink/5 px-3 py-1">
                  <Text className="text-xs font-semibold">{t(`badges.${badge}`)}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => void handleShare()} className="items-center rounded-xl bg-accent py-3">
            <Text className="text-sm font-bold text-paper">
              {shareStatus === "copied" ? t("shareCopied") : t("share")}
            </Text>
          </Pressable>

          <View>
            <View className="mb-3 flex-row self-start rounded-full border border-rule bg-ink/5 p-1">
              {(["today", "total"] as const).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setLeaderboardTab(tab)}
                  className={`rounded-full px-4 py-1.5 ${leaderboardTab === tab ? "bg-accent" : ""}`}
                >
                  <Text className={leaderboardTab === tab ? "font-semibold text-paper" : "text-ink-soft"}>
                    {t(`leaderboard.tab.${tab}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Leaderboard data={leaderboard} tab={leaderboardTab} currentUsername={identity.username} loadingText={t("loading")} emptyText={t("leaderboard.empty")} />
          </View>
        </View>
      ) : (
        <LoadingBox text={t("loading")} />
      )}
    </ScrollView>
  );
}

function LoadingBox({ text }: { text: string }) {
  return (
    <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
      <Text className="text-ink-mute">{text}</Text>
    </View>
  );
}

function GuessInput({
  players,
  excludedIds,
  onGuess,
  placeholder,
  emptyText,
}: {
  players: Player[];
  excludedIds: Set<string>;
  onGuess: (player: Player) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return players.filter((p) => !excludedIds.has(p.id) && normalize(p.name).includes(q)).slice(0, 8);
  }, [query, players, excludedIds]);

  function pick(player: Player) {
    onGuess(player);
    setQuery("");
    setOpen(false);
  }

  return (
    <View className="relative">
      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
      />
      {open && query.trim().length >= 2 && (
        <View className="absolute top-16 z-20 max-h-72 w-full rounded-xl border border-rule bg-paper">
          {filtered.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-mute">{emptyText}</Text>
          ) : (
            <ScrollView>
              {filtered.map((p) => (
                <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-2">
                  <Text className="text-sm">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function Leaderboard({
  data,
  tab,
  currentUsername,
  loadingText,
  emptyText,
}: {
  data: LeaderboardResponse | null;
  tab: "today" | "total";
  currentUsername: string;
  loadingText: string;
  emptyText: string;
}) {
  if (!data || data.type !== tab) return <LoadingBox text={loadingText} />;
  if (data.entries.length === 0) {
    return (
      <View className="py-6">
        <Text className="text-center text-sm text-ink-mute">{emptyText}</Text>
      </View>
    );
  }

  const rows =
    data.type === "today"
      ? data.entries.map((e) => ({ username: e.username, value: String(e.correctCount) }))
      : data.entries.map((e) => ({ username: e.username, value: String(e.totalCorrect) }));

  return (
    <View className="gap-1">
      {rows.map((row, idx) => {
        const isMe = row.username === currentUsername;
        return (
          <View
            key={row.username}
            className={`flex-row items-center justify-between rounded-lg px-3 py-2 ${
              isMe ? "border border-accent/40 bg-accent/10" : "bg-ink/5"
            }`}
          >
            <View className="flex-row items-center gap-2">
              <Text className="w-5 text-right text-ink-mute">{idx + 1}</Text>
              <Text className={isMe ? "font-semibold" : undefined}>{row.username}</Text>
            </View>
            <Text className="text-ink-soft">{row.value}</Text>
          </View>
        );
      })}
    </View>
  );
}
