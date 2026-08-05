"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Dataset, Player } from "@/lib/types";
import { loadDataset } from "@/lib/data";
import { validateUsername } from "@/lib/profanity";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

const IDENTITY_KEY = "321guess.online.player";
const PROGRESS_KEY_PREFIX = "321guess.online.progress.";
const ROUND_DURATION_MS = 3 * 60 * 1000;
// Day the Daily Challenge launched — every shared result gets a puzzle
// number counting up from here, the same way Wordle numbers its puzzles.
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

/** A Wordle-style block bar — one block per player found, capped at 10.
 * Deliberately not scaled against totalPossible: the pool of shared players
 * across 5 "easy" matchups is often 100+, so a percentage-of-total bar would
 * read as nearly empty even for a genuinely strong round. The exact X/Y
 * still appears in the line above, so nothing is hidden — this is just the
 * visual that's meant to look good enough to share. */
function scoreBar(correct: number): string {
  const filled = Math.max(0, Math.min(10, correct));
  return "🟩".repeat(filled) + "⬜".repeat(10 - filled);
}

type Identity = { token: string; username: string };

type ClubRef = { id: string; name: string; logoUrl: string };

type QuestionInfo = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };

type RoundInfo = {
  roundDate: string;
  questions: QuestionInfo[];
  totalPossible: number;
};

type FinishResult = {
  correctCount: number;
  totalPossible: number;
  currentStreak: number;
  longestStreak: number;
};

type StoredProgress =
  | { finished: true; result: FinishResult }
  | {
      finished: false;
      questionIndex: number;
      foundPlayerIds: string[];
      wrongPlayerIds: string[];
      overallFoundCount: number;
      startedAt: number;
    };

function progressKey(roundDate: string) {
  return `${PROGRESS_KEY_PREFIX}${roundDate}`;
}

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && typeof parsed?.username === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function loadProgress(roundDate: string): StoredProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(roundDate));
    return raw ? (JSON.parse(raw) as StoredProgress) : null;
  } catch {
    return null;
  }
}

function saveProgress(roundDate: string, progress: StoredProgress) {
  localStorage.setItem(progressKey(roundDate), JSON.stringify(progress));
}

type LeaderboardResponse =
  | { type: "today"; roundDate: string; entries: { username: string; correctCount: number; totalPossible: number; durationMs: number }[] }
  | { type: "total"; entries: { username: string; totalCorrect: number; daysPlayed: number }[] };

export function OnlineScreen() {
  const t = useTranslations("online");
  const locale = useLocale();

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
  const [shareCopied, setShareCopied] = useState(false);
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(
    null,
  );

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
    setIdentity(loadIdentity());
    setIdentityLoaded(true);
    loadDataset().then(setDataset);
  }, []);

  useEffect(() => {
    if (!identityLoaded || !identity) return;
    fetch("/api/online/round")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: RoundInfo) => setRound(data))
      .catch(() => setRoundLoadFailed(true));
  }, [identityLoaded, identity]);

  // Resume an in-progress or already-finished round after a reload.
  useEffect(() => {
    if (!round || !dataset) return;
    const saved = loadProgress(round.roundDate);
    if (!saved) return;
    if (saved.finished) {
      setResult(saved.result);
      setPhase("finished");
      return;
    }
    const byId = new Map(dataset.players.map((p) => [p.id, p] as const));
    setQuestionIndex(saved.questionIndex ?? 0);
    // Progress saved by an older client build may be missing fields added
    // since (e.g. wrongPlayerIds) — default them instead of crashing on
    // undefined.map() for anyone with an in-progress round from before a deploy.
    setFoundPlayers((saved.foundPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
    setWrongPlayers((saved.wrongPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
    setOverallFoundCount(saved.overallFoundCount ?? 0);
    const startedAt = saved.startedAt ?? Date.now();
    const elapsed = Date.now() - startedAt;
    startTimeRef.current = startedAt;
    setTimeLeftMs(Math.max(0, ROUND_DURATION_MS - elapsed));
    setPhase("playing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, dataset]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setTimeLeftMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && timeLeftMs <= 0) {
      void finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeftMs]);

  useEffect(() => {
    if (phase !== "finished") return;
    fetch(`/api/online/leaderboard?type=${leaderboardTab}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLeaderboard)
      .catch(() => setLeaderboard(null));
  }, [phase, leaderboardTab]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    const validation = validateUsername(trimmed);
    if (!validation.valid) {
      setUsernameError(validation.reason);
      return;
    }
    setRegistering(true);
    setUsernameError(null);
    try {
      const token = crypto.randomUUID();
      const res = await fetch("/api/online/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "username_taken") setUsernameError("taken");
        else if (data.error === "invalid_username_blocked") setUsernameError("blocked");
        else if (data.error === "invalid_username_format" || data.error === "invalid_body") setUsernameError("format");
        else setUsernameError("server");
        return;
      }
      const newIdentity: Identity = { token, username: data.username };
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
    } catch {
      setUsernameError("server");
    } finally {
      setRegistering(false);
    }
  }

  /** A saved identity can outlive its server-side record (e.g. moderation
   * cleanup, or Supabase data reset) — every online API returns 401 in that
   * case. Without this, guesses/finish would fail silently forever with no
   * way for the player to tell why nothing is working. */
  function handleExpiredIdentity() {
    try {
      localStorage.removeItem(IDENTITY_KEY);
      // Cached progress is keyed by date, not by identity — sweep it all so
      // a fresh registration can't inherit a ghost identity's stale result.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(PROGRESS_KEY_PREFIX)) localStorage.removeItem(key);
      }
    } catch {}
    setIdentity(null);
    setRound(null);
    setPhase("matchup");
    setResult(null);
    setUsernameError("expired");
  }

  async function startRound() {
    if (!round || !identity) return;
    try {
      // Server-recorded start time is what actually decides the speed
      // tie-break — this local timestamp only drives the UI countdown.
      const res = await fetch("/api/online/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity.token }),
      });
      if (res.status === 401) {
        handleExpiredIdentity();
        return;
      }
    } catch {
      // Best-effort — finishRound falls back to the earliest guess timestamp.
    }
    startTimeRef.current = Date.now();
    setPhase("playing");
    setQuestionIndex(0);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setOverallFoundCount(0);
    setTimeLeftMs(ROUND_DURATION_MS);
    saveProgress(round.roundDate, {
      finished: false,
      questionIndex: 0,
      foundPlayerIds: [],
      wrongPlayerIds: [],
      overallFoundCount: 0,
      startedAt: startTimeRef.current,
    });
  }

  async function submitGuess(player: Player) {
    if (
      !identity ||
      !round ||
      foundPlayers.some((p) => p.id === player.id) ||
      wrongPlayers.some((p) => p.id === player.id)
    ) {
      return;
    }
    try {
      const res = await fetch("/api/online/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity.token, questionIndex, playerId: player.id }),
      });
      if (res.status === 401) {
        handleExpiredIdentity();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.correct) {
        flashGuessFeedback("correct", player.name);
        setFoundPlayers((prev) => {
          const next = [...prev, player];
          setOverallFoundCount(data.overallFoundCount);
          saveProgress(round.roundDate, {
            finished: false,
            questionIndex,
            foundPlayerIds: next.map((p) => p.id),
            wrongPlayerIds: wrongPlayers.map((p) => p.id),
            overallFoundCount: data.overallFoundCount,
            startedAt: startTimeRef.current ?? Date.now(),
          });
          return next;
        });
      } else {
        flashGuessFeedback("wrong", player.name);
        setWrongPlayers((prev) => {
          const next = [...prev, player];
          saveProgress(round.roundDate, {
            finished: false,
            questionIndex,
            foundPlayerIds: foundPlayers.map((p) => p.id),
            wrongPlayerIds: next.map((p) => p.id),
            overallFoundCount,
            startedAt: startTimeRef.current ?? Date.now(),
          });
          return next;
        });
      }
    } catch {
      // Best-effort — a dropped guess just doesn't count; the player can retry.
    }
  }

  function goToNextQuestion() {
    if (!round) return;
    const next = questionIndex + 1;
    if (next >= round.questions.length) {
      void finish();
      return;
    }
    setQuestionIndex(next);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
    saveProgress(round.roundDate, {
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
      const res = await fetch("/api/online/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity.token }),
      });
      if (res.status === 401) {
        handleExpiredIdentity();
        return;
      }
      if (res.ok) {
        const data: FinishResult = await res.json();
        setResult(data);
        setPhase("finished");
        saveProgress(round.roundDate, { finished: true, result: data });
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

  async function shareResult() {
    const text = shareText();
    if (!text) return;
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text });
        return;
      } catch {
        // User cancelled the native share sheet, or it's unsupported for
        // this payload — fall through to a plain clipboard copy.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — nothing left to fall back to.
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center justify-between gap-3">
        <a href={`/${locale}`} className="text-xs uppercase tracking-wider text-ink/50 hover:text-ink">
          ← {t("backHome")}
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          <span className="text-accent">{t("title")}</span>
        </h1>
        <p className="mt-1 text-sm text-ink/60">{t("description")}</p>
      </div>

      {!identityLoaded ? (
        <LoadingBox text={t("loading")} />
      ) : !identity ? (
        <form onSubmit={handleRegister} className="space-y-3">
          <label className="block text-sm font-semibold text-ink/80">{t("username.label")}</label>
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => {
              setUsernameInput(e.target.value);
              setUsernameError(null);
            }}
            placeholder={t("username.placeholder")}
            className="w-full rounded-xl border border-ink/10 bg-paper-2 px-4 py-3 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none"
            maxLength={20}
            autoComplete="off"
          />
          {usernameError && <p className="text-xs text-red-500">{t(`username.error.${usernameError}`)}</p>}
          <p className="text-xs text-ink/40">{t("username.hint")}</p>
          <button
            type="submit"
            disabled={registering || usernameInput.trim().length === 0}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 transition hover:bg-accent-strong active:scale-95 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/30 disabled:shadow-none disabled:active:scale-100"
          >
            {registering ? t("username.submitting") : t("username.submit")}
          </button>
        </form>
      ) : roundLoadFailed ? (
        <LoadingBox text={t("roundError")} />
      ) : !round || !dataset ? (
        <LoadingBox text={t("loading")} />
      ) : phase === "matchup" ? (
        <div className="space-y-6">
          <p className="text-sm text-ink/60">{t("welcomeBack", { username: identity.username })}</p>
          <div className="rounded-xl border-2 border-ink/10 bg-ink/5 p-8 text-center">
            <div className="text-4xl font-black text-accent">{round.questions.length}</div>
            <p className="mt-1 text-sm text-ink/60">{t("questionCountLabel")}</p>
          </div>
          <p className="text-center text-xs text-ink/40">
            {t("instructions", { minutes: ROUND_DURATION_MS / 60000, questions: round.questions.length })}
          </p>
          <button
            onClick={() => void startRound()}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 transition hover:bg-accent-strong active:scale-95"
          >
            {t("start")}
          </button>
        </div>
      ) : phase === "playing" && currentQuestion ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-ink/40">
            <span>{t("questionProgress", { current: questionIndex + 1, total: round.questions.length })}</span>
            <span>{t("foundCount", { found: overallFoundCount, total: round.totalPossible })}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border-2 border-ink/10 bg-ink/5 px-4 py-3">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span>{currentQuestion.clubA.name}</span>
              <span className="text-ink/40">{t("vs")}</span>
              <span>{currentQuestion.clubB.name}</span>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-bold tabular-nums text-accent">
              {formatTime(timeLeftMs)}
            </span>
          </div>

          <GuessInput
            players={dataset.players}
            excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
            onGuess={submitGuess}
            placeholder={t("guessPlaceholder")}
            emptyText={t("guessEmpty")}
          />

          {guessFeedback && (
            <div
              key={guessFeedback.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold animate-fade-in ${
                guessFeedback.status === "correct"
                  ? "bg-accent/15 text-accent"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              <span className="text-base leading-none">{guessFeedback.status === "correct" ? "✓" : "✗"}</span>
              <span className="truncate">{guessFeedback.label}</span>
            </div>
          )}

          {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
            <ul className="flex flex-wrap gap-2">
              {foundPlayers.map((p) => (
                <li key={p.id} className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-ink">
                  {p.name}
                </li>
              ))}
              {wrongPlayers.map((p) => (
                <li
                  key={p.id}
                  className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400"
                >
                  ✕ {p.name}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={goToNextQuestion}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-paper shadow-lg shadow-accent/20 transition hover:bg-accent-strong active:scale-95"
          >
            {foundPlayers.length > 0 ? t("nextQuestion") : t("pass")}
          </button>

          <button
            onClick={() => void finish()}
            className="w-full rounded-xl border border-ink/10 py-3 text-sm font-semibold text-ink/70 transition hover:border-ink/30 hover:text-ink active:scale-95"
          >
            {t("finishEarly")}
          </button>
        </div>
      ) : result ? (
        <div className="space-y-6">
          <div className="rounded-xl border-2 border-accent bg-accent/10 p-6 text-center">
            <div className="text-3xl font-black">
              {result.correctCount} / {result.totalPossible}
            </div>
            <p className="mt-1 text-sm text-ink/60">{t("resultLabel")}</p>
            {result.currentStreak > 0 && (
              <p className="mt-3 text-sm font-semibold text-accent">
                🔥 {t("streakLabel", { count: result.currentStreak })}
              </p>
            )}
          </div>

          {badges.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {badges.map((badge) => (
                <span key={badge} className="rounded-full border border-ink/10 bg-ink/5 px-3 py-1 text-xs font-semibold">
                  {t(`badges.${badge}`)}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => void shareResult()}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-paper shadow-lg shadow-accent/20 transition hover:bg-accent-strong active:scale-95"
          >
            {shareCopied ? t("shareCopied") : t("share")}
          </button>

          <div>
            <div className="mb-3 inline-flex rounded-full border border-ink/10 bg-ink/5 p-1 text-sm">
              {(["today", "total"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLeaderboardTab(tab)}
                  className={`rounded-full px-4 py-1.5 transition active:scale-95 ${
                    leaderboardTab === tab ? "bg-accent text-paper font-semibold" : "text-ink/70 hover:text-ink"
                  }`}
                >
                  {t(`leaderboard.tab.${tab}`)}
                </button>
              ))}
            </div>
            <Leaderboard data={leaderboard} tab={leaderboardTab} currentUsername={identity.username} t={t} />
          </div>
        </div>
      ) : (
        <LoadingBox text={t("loading")} />
      )}
    </main>
  );
}

function computeBadges(result: FinishResult): string[] {
  const badges: string[] = [];
  if (result.totalPossible > 0 && result.correctCount === result.totalPossible) badges.push("perfect");
  if (result.currentStreak >= 30) badges.push("streak30");
  else if (result.currentStreak >= 7) badges.push("streak7");
  else if (result.currentStreak >= 3) badges.push("streak3");
  return badges;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function LoadingBox({ text }: { text: string }) {
  return <div className="rounded-lg border border-ink/10 bg-ink/5 p-8 text-center text-ink/60">{text}</div>;
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
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-ink/10 bg-paper-2 px-4 py-3 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none"
        autoComplete="off"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink/10 bg-paper shadow-xl shadow-ink/10">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ink/40">{emptyText}</div>
          ) : (
            <ul>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition hover:bg-ink/5 active:scale-[0.98] active:bg-accent/10"
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Leaderboard({
  data,
  tab,
  currentUsername,
  t,
}: {
  data: LeaderboardResponse | null;
  tab: "today" | "total";
  currentUsername: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (!data) return <LoadingBox text={t("loading")} />;
  if (data.type !== tab) return <LoadingBox text={t("loading")} />;

  if (data.entries.length === 0) {
    return <p className="py-6 text-center text-sm text-ink/40">{t("leaderboard.empty")}</p>;
  }

  const rows =
    data.type === "today"
      ? data.entries.map((e) => ({ username: e.username, value: String(e.correctCount) }))
      : data.entries.map((e) => ({ username: e.username, value: String(e.totalCorrect) }));

  return (
    <ol className="space-y-1">
      {rows.map((row, idx) => {
        const isMe = row.username === currentUsername;
        return (
          <li
            key={row.username}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              isMe ? "border border-accent/40 bg-accent/10 font-semibold" : "bg-ink/5"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 text-right text-ink/40">{idx + 1}</span>
              <span className="truncate">{row.username}</span>
            </span>
            <span className="tabular-nums text-ink/70">{row.value}</span>
          </li>
        );
      })}
    </ol>
  );
}
