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

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

type Identity = { token: string; username: string };

type RoundInfo = {
  roundDate: string;
  clubA: { id: string; name: string; logoUrl: string };
  clubB: { id: string; name: string; logoUrl: string };
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
  | { finished: false; foundPlayerIds: string[]; startedAt: number };

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
  | { type: "streak"; entries: { username: string; longestStreak: number; currentStreak: number }[] };

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
  const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [result, setResult] = useState<FinishResult | null>(null);

  const [leaderboardTab, setLeaderboardTab] = useState<"today" | "streak">("today");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const finishingRef = useRef(false);

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
    setFoundPlayers(saved.foundPlayerIds.map((id) => byId.get(id)).filter((p): p is Player => !!p));
    const elapsed = Date.now() - saved.startedAt;
    if (elapsed >= ROUND_DURATION_MS) {
      startTimeRef.current = saved.startedAt;
      setPhase("playing");
      setTimeLeftMs(0);
    } else {
      startTimeRef.current = saved.startedAt;
      setTimeLeftMs(ROUND_DURATION_MS - elapsed);
      setPhase("playing");
    }
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

  async function startRound() {
    if (!round || !identity) return;
    startTimeRef.current = Date.now();
    setPhase("playing");
    setTimeLeftMs(ROUND_DURATION_MS);
    saveProgress(round.roundDate, { finished: false, foundPlayerIds: [], startedAt: startTimeRef.current });
    try {
      // Server-recorded start time is what actually decides the speed
      // tie-break — this local timestamp only drives the UI countdown.
      await fetch("/api/online/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity.token }),
      });
    } catch {
      // Best-effort — finishRound falls back to the earliest guess timestamp.
    }
  }

  async function submitGuess(player: Player) {
    if (!identity || !round || foundPlayers.some((p) => p.id === player.id)) return;
    try {
      const res = await fetch("/api/online/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: identity.token, playerId: player.id }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.correct) {
        setFoundPlayers((prev) => {
          const next = [...prev, player];
          saveProgress(round.roundDate, {
            finished: false,
            foundPlayerIds: next.map((p) => p.id),
            startedAt: startTimeRef.current ?? Date.now(),
          });
          return next;
        });
      }
    } catch {
      // Best-effort — a dropped guess just doesn't count; the player can retry.
    }
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

  function shareText(): string {
    if (!result || !round) return "";
    const streakSuffix = result.currentStreak > 0 ? ` · 🔥${result.currentStreak}` : "";
    return `321guess ${round.roundDate}: ${result.correctCount}/${result.totalPossible}${streakSuffix}`;
  }

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText());
    } catch {
      // Clipboard API unavailable — nothing to fall back to, fail silently.
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
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/30 disabled:shadow-none"
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
          <div className="flex items-center justify-center gap-6 rounded-xl border-2 border-ink/10 bg-ink/5 p-8">
            <ClubBadge name={round.clubA.name} logoUrl={round.clubA.logoUrl} />
            <span className="text-sm font-bold uppercase tracking-widest text-ink/40">{t("vs")}</span>
            <ClubBadge name={round.clubB.name} logoUrl={round.clubB.logoUrl} />
          </div>
          <p className="text-center text-xs text-ink/40">{t("instructions", { minutes: ROUND_DURATION_MS / 60000 })}</p>
          <button
            onClick={startRound}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent-strong"
          >
            {t("start")}
          </button>
        </div>
      ) : phase === "playing" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border-2 border-ink/10 bg-ink/5 px-4 py-3">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span>{round.clubA.name}</span>
              <span className="text-ink/40">{t("vs")}</span>
              <span>{round.clubB.name}</span>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-bold tabular-nums text-accent">
              {formatTime(timeLeftMs)}
            </span>
          </div>

          <GuessInput
            players={dataset.players}
            foundIds={new Set(foundPlayers.map((p) => p.id))}
            onGuess={submitGuess}
            placeholder={t("guessPlaceholder")}
            emptyText={t("guessEmpty")}
          />

          <p className="text-xs text-ink/40">{t("foundCount", { found: foundPlayers.length, total: round.totalPossible })}</p>

          {foundPlayers.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {foundPlayers.map((p) => (
                <li key={p.id} className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-ink">
                  {p.name}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => void finish()}
            className="w-full rounded-xl border border-ink/10 py-3 text-sm font-semibold text-ink/70 hover:border-ink/30 hover:text-ink"
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
            onClick={copyShareText}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent-strong"
          >
            {t("share")}
          </button>

          <div>
            <div className="mb-3 inline-flex rounded-full border border-ink/10 bg-ink/5 p-1 text-sm">
              {(["today", "streak"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLeaderboardTab(tab)}
                  className={`rounded-full px-4 py-1.5 transition ${
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

function ClubBadge({ name, logoUrl }: { name: string; logoUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={logoUrl} alt={name} className="h-16 w-16 object-contain" loading="lazy" />
      <span className="max-w-[7rem] text-center text-xs font-semibold text-ink/70">{name}</span>
    </div>
  );
}

function GuessInput({
  players,
  foundIds,
  onGuess,
  placeholder,
  emptyText,
}: {
  players: Player[];
  foundIds: Set<string>;
  onGuess: (player: Player) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return players.filter((p) => !foundIds.has(p.id) && normalize(p.name).includes(q)).slice(0, 8);
  }, [query, players, foundIds]);

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
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-ink/5"
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
  tab: "today" | "streak";
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
      ? data.entries.map((e) => ({ username: e.username, value: `${e.correctCount}/${e.totalPossible}` }))
      : data.entries.map((e) => ({ username: e.username, value: `🔥 ${e.longestStreak}` }));

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
