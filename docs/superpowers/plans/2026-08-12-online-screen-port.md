# Port OnlineScreen (Daily Challenge) to apps/web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (executed directly this session, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `OnlineScreen` — the Daily Challenge (registration, timed
5-question round, live guess-checking, results/badges/share/leaderboard)
— to `apps/web`. This is the last major screen; it's also the actual
reason push notifications were the original goal of this whole
migration, so once this lands the app is functionally complete.

**Architecture:** The original uses `localStorage` (synchronous) for the
player's identity token and per-round progress cache — React Native has
no `localStorage`, so this plan introduces `@react-native-async-storage/
async-storage` (the standard, Expo-Go-compatible, web-and-native storage
library) and refactors every storage call from sync to async. Every
`fetch("/api/online/...")` call becomes `fetch(`${apiBaseUrl()}/api/
online/...`)`, same pattern as every prior plan. `navigator.share`/
`navigator.clipboard` become React Native's built-in `Share` API +
`expo-clipboard`. `crypto.randomUUID()` becomes `expo-crypto`'s
`randomUUID()` (safer than relying on an inconsistent native `crypto`
polyfill across web/iOS/Android).

**Tech Stack:** `@react-native-async-storage/async-storage`, `expo-crypto`,
`expo-clipboard`, React Native's `Share` module.

## Global Constraints

- No subagent dispatch — direct execution, commit after each task. Never
  run `git reset --hard`, `git checkout -- .`, or `git clean`.
- **Every new POST route this screen calls needs a CORS `OPTIONS` handler**,
  same fix already applied to `/api/round` in the prior plan (Next.js
  returns 405 for unhandled `OPTIONS`, which fails the browser's
  preflight for any cross-origin POST with a JSON body). This applies to
  `apps/api/app/api/online/{register,start,guess,finish}/route.ts` — all
  four are POST+JSON, all four are called from this screen. `/api/online/
  round` and `/api/online/leaderboard` are GET, already covered by
  `next.config.ts`'s existing `headers()` config from the prior plan —
  no changes needed there.
- Original source: `git show 8329015:components/OnlineScreen.tsx` (778
  lines, already fetched in full this session — every code block below is
  quoted from that fetch, not re-derived).
- Verification is still: TypeScript compiles, `npx expo export -p web`
  succeeds, and a live check in a real browser via Playwright (the
  technique that caught the CORS bug in the prior plan) — click through
  registration → matchup → a guess → finish, not just static-render
  grep, since this screen's correctness lives almost entirely in
  interactive behavior a static export can't exercise.
- `apps/api`'s existing `register`/`start`/`guess`/`finish`/`leaderboard`
  routes and their Supabase-backed logic are untouched — this plan only
  adds CORS preflight support to them and a client that calls them
  exactly as they already exist today.

---

### Task 1: CORS preflight support for the online-mode POST routes

**Files:**
- Modify: `apps/api/app/api/online/register/route.ts`
- Modify: `apps/api/app/api/online/start/route.ts`
- Modify: `apps/api/app/api/online/guess/route.ts`
- Modify: `apps/api/app/api/online/finish/route.ts`

**Interfaces:** None — same `OPTIONS` handler added to `/api/round` in
the prior plan, copied to four more files.

- [ ] **Step 1: Add the OPTIONS handler to each of the four files**

Same pattern, same comment, added right before each file's existing
`export async function POST(req: Request) {`:

```typescript
// Browsers preflight cross-origin POST requests with a JSON body
// (apps/web calling this from a different origin) before sending the
// real request — next.config.ts's headers() sets the CORS headers on
// the response, but a route with no OPTIONS export gets Next.js's
// default 405 for it, which fails the preflight. An empty 204 here is
// all a preflight needs.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
```

(All four files already `import { NextResponse } from "next/server"` —
confirm this import exists in each before adding the handler; it does in
all four, per this session's earlier read of their content.)

- [ ] **Step 2: Verify each route still type-checks and the preflight works**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/api
npx tsc --noEmit
```
Then, with `apps/api`'s dev server running:
```bash
curl -s -X OPTIONS -H "Origin: http://localhost:8081" -H "Access-Control-Request-Method: POST" -i http://localhost:3000/api/online/register | head -5
```
Expected: `HTTP/1.1 204 No Content` + the CORS headers, matching the
`/api/round` check from the prior plan.

- [ ] **Step 3: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/api/app/api/online/register/route.ts apps/api/app/api/online/start/route.ts apps/api/app/api/online/guess/route.ts apps/api/app/api/online/finish/route.ts
git commit -m "Add CORS preflight support to the online-mode POST routes

Same fix as the prior plan's /api/round OPTIONS handler — these four
routes are the ones OnlineScreen calls, and all four are POST+JSON, so
all four need it before apps/web can reach them cross-origin."
```

---

### Task 2: Storage, API client, and share utility modules

**Files:**
- Create: `apps/web/src/lib/online-storage.ts`
- Create: `apps/web/src/lib/online-api.ts`
- Create: `apps/web/src/lib/share.ts`
- Modify: `apps/web/package.json` — add the three new dependencies

**Interfaces:**
- Produces from `online-storage.ts`: `loadIdentity(): Promise<Identity | null>`,
  `saveIdentity(identity: Identity): Promise<void>`, `clearIdentity(): Promise<void>`,
  `loadProgress(roundDate: string): Promise<StoredProgress | null>`,
  `saveProgress(roundDate: string, progress: StoredProgress): Promise<void>`,
  `clearAllProgress(): Promise<void>`, plus the `Identity` and
  `StoredProgress` types (moved here from being OnlineScreen-local types
  in the original, since the storage module now owns their shape).
- Produces from `online-api.ts`: `registerPlayer`, `fetchRound`,
  `startRound`, `submitGuess`, `finishRound`, `fetchLeaderboard` — one
  function per `/api/online/*` endpoint, each returning a typed result
  or throwing/returning `null` on failure (exact signatures in Step 2).
- Produces from `share.ts`: `shareOrCopy(text: string): Promise<"shared" | "copied" | "failed">`.
- Consumed by: `OnlineScreen.tsx` (Task 3).

- [ ] **Step 1: Install the new dependencies**

```bash
cd /Users/munurcoskun/Claude/321guess
npm install --workspace apps/web @react-native-async-storage/async-storage@^3.1.1 expo-crypto@~57.0.1 expo-clipboard@~57.0.1
```

- [ ] **Step 2: Create `online-storage.ts`**

Ported from the original's `IDENTITY_KEY`/`PROGRESS_KEY_PREFIX` constants
and `loadIdentity`/`loadProgress`/`saveProgress` functions (`git show
8329015:components/OnlineScreen.tsx` lines 12-13, 62-99 — already
quoted in full above), made async for `AsyncStorage`:

```typescript
// apps/web/src/lib/online-storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const IDENTITY_KEY = "321guess.online.player";
const PROGRESS_KEY_PREFIX = "321guess.online.progress.";

export type Identity = { token: string; username: string };

export type FinishResult = {
  correctCount: number;
  totalPossible: number;
  currentStreak: number;
  longestStreak: number;
};

export type StoredProgress =
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

export async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && typeof parsed?.username === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

/** A saved identity can outlive its server-side record (moderation
 * cleanup, a Supabase reset) — every online API returns 401 in that
 * case. Sweeps cached progress too, since it's keyed by date, not
 * identity, and a fresh registration shouldn't inherit a ghost
 * identity's stale result. */
export async function clearIdentity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(IDENTITY_KEY);
    const keys = await AsyncStorage.getAllKeys();
    const progressKeys = keys.filter((k) => k.startsWith(PROGRESS_KEY_PREFIX));
    if (progressKeys.length > 0) await AsyncStorage.multiRemove(progressKeys);
  } catch {}
}

export async function loadProgress(roundDate: string): Promise<StoredProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey(roundDate));
    return raw ? (JSON.parse(raw) as StoredProgress) : null;
  } catch {
    return null;
  }
}

export async function saveProgress(roundDate: string, progress: StoredProgress): Promise<void> {
  await AsyncStorage.setItem(progressKey(roundDate), JSON.stringify(progress));
}
```

- [ ] **Step 3: Create `online-api.ts`**

One function per endpoint, matching each route's exact request/response
shape (confirmed by reading `apps/api/app/api/online/*/route.ts` this
session):

```typescript
// apps/web/src/lib/online-api.ts
import { apiBaseUrl } from "./api-base-url";

type ClubRef = { id: string; name: string; logoUrl: string };
export type QuestionInfo = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };
export type RoundInfo = { roundDate: string; questions: QuestionInfo[]; totalPossible: number };

export type RegisterResult =
  | { ok: true; username: string }
  | { ok: false; reason: "taken" | "blocked" | "format" | "server" };

export async function registerPlayer(username: string, token: string): Promise<RegisterResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "username_taken") return { ok: false, reason: "taken" };
      if (data.error === "invalid_username_blocked") return { ok: false, reason: "blocked" };
      if (data.error === "invalid_username_format" || data.error === "invalid_body") {
        return { ok: false, reason: "format" };
      }
      return { ok: false, reason: "server" };
    }
    return { ok: true, username: data.username };
  } catch {
    return { ok: false, reason: "server" };
  }
}

export async function fetchRound(): Promise<RoundInfo | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/round`);
    if (!res.ok) return null;
    return (await res.json()) as RoundInfo;
  } catch {
    return null;
  }
}

/** Returns 401 as a distinct result (not a thrown error) so the caller can
 * tell "identity expired" apart from "network hiccup, try again". */
export async function startRound(token: string): Promise<"ok" | "expired" | "failed"> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) return "expired";
    return res.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export type GuessResult =
  | { status: "expired" }
  | { status: "failed" }
  | { status: "ok"; correct: boolean; overallFoundCount: number };

export async function submitGuess(token: string, questionIndex: number, playerId: string): Promise<GuessResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, questionIndex, playerId }),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    const data = await res.json();
    return { status: "ok", correct: data.correct, overallFoundCount: data.overallFoundCount };
  } catch {
    return { status: "failed" };
  }
}

export type FinishApiResult =
  | { status: "expired" }
  | { status: "failed" }
  | {
      status: "ok";
      result: { correctCount: number; totalPossible: number; currentStreak: number; longestStreak: number };
    };

export async function finishRound(token: string): Promise<FinishApiResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", result: await res.json() };
  } catch {
    return { status: "failed" };
  }
}

export type LeaderboardResponse =
  | { type: "today"; roundDate: string; entries: { username: string; correctCount: number; totalPossible: number; durationMs: number }[] }
  | { type: "total"; entries: { username: string; totalCorrect: number; daysPlayed: number }[] };

export async function fetchLeaderboard(tab: "today" | "total"): Promise<LeaderboardResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/leaderboard?type=${tab}`);
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardResponse;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create `share.ts`**

React Native's built-in `Share` module replaces `navigator.share`;
`expo-clipboard` replaces `navigator.clipboard`:

```typescript
// apps/web/src/lib/share.ts
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";

/** Tries the native share sheet first; falls back to clipboard if the
 * user cancels, the platform has no share sheet (some web browsers), or
 * sharing throws. Mirrors the original's navigator.share-then-clipboard
 * fallback chain. */
export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.sharedAction) return "shared";
    // action === dismissedAction (user cancelled) — fall through to copy.
  } catch {
    // Share unsupported on this platform — fall through to copy.
  }
  try {
    await Clipboard.setStringAsync(text);
    return "copied";
  } catch {
    return "failed";
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/lib/online-storage.ts apps/web/src/lib/online-api.ts apps/web/src/lib/share.ts apps/web/package.json package-lock.json
git commit -m "Add AsyncStorage-backed identity/progress storage, an online-mode
API client, and a Share+Clipboard fallback util for apps/web

localStorage (sync) doesn't exist in React Native — every storage call
in the port is async now via @react-native-async-storage/async-storage.
crypto.randomUUID() becomes expo-crypto's randomUUID() (Task 3) rather
than relying on an inconsistent native crypto polyfill across
web/iOS/Android."
```

---

### Task 3: Port `OnlineScreen.tsx`

**Files:**
- Create: `apps/web/src/components/OnlineScreen.tsx`

**Interfaces:**
- Consumes: everything from Task 2's three modules, `useGameSettings`
  is NOT needed here (Daily Challenge doesn't use local-mode settings),
  `LogoTile`/`ThemeToggle`/`LanguageSwitcher` (already ported),
  `validateUsername` from `@321guess/core`, `useLocale`/`useTranslations`
  from `use-intl`, `useRouter` from `expo-router`.

- [ ] **Step 1: Port the component**

Original: `git show 8329015:components/OnlineScreen.tsx`, full 778 lines
already fetched and quoted in full earlier this session. RN port below —
every phase (registration form, matchup preview, playing, finished)
translated to RN primitives following the exact patterns already
established in `ManualScreen`/`SetupScreen`/`PlayScreen`'s ports
(`Pressable` instead of `button`/`onClick`, `TextInput` instead of
`input`, `View`/`Text` instead of `div`/`span`, RN's `Animated` already
proven in `Countdown` — not needed here since this screen has no
keyframe animation to port, just the existing `flash feedback` timeout
pattern which is plain `setTimeout`, not CSS).

```tsx
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
  type StoredProgress,
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
```

(Dropped: the `t` prop threading through `Leaderboard` in the original —
this port passes the two specific strings it needs (`loadingText`,
`emptyText`) instead, since `use-intl`'s `useTranslations` isn't a plain
serializable value the way the original's closure-captured `t` was; the
component's own `LoadingBox` calls handle the rest. Web `Share`
capability detection and the `active:scale-95` press-feedback classes
from the original are also dropped — RN has no `:active` pseudo-class
via NativeWind the same way; a `Pressable`-based press-scale effect is a
polish-pass item, not required for this port's functional goal.)

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/components/OnlineScreen.tsx
git commit -m "Port OnlineScreen to apps/web

All four phases (registration, matchup preview, timed playing, finished
results/badges/share/leaderboard) ported to RN primitives + the Task 2
storage/API/share modules. Dropped for this first pass: web Share
capability probing (RN's Share module handles platform differences
itself), :active press-scale styling (polish-pass item)."
```

---

### Task 4: Wire `/online` route, remove the `as never` cast, end-to-end verification

**Files:**
- Create: `apps/web/src/app/online.tsx`
- Modify: `apps/web/src/components/SetupScreen.tsx` — remove the
  `as never` cast on `router.push("/online")` now that the route exists

**Interfaces:** None new.

- [ ] **Step 1: Create the route**

```tsx
// apps/web/src/app/online.tsx
import { OnlineScreen } from "@/components/OnlineScreen";

export default function OnlineRoute() {
  return <OnlineScreen />;
}
```

- [ ] **Step 2: Remove the temporary cast in `SetupScreen.tsx`**

```diff
-                // /online (OnlineScreen / Daily Challenge) doesn't exist yet —
-                // ported in a later plan. Typed-routes doesn't know this path
-                // yet, hence the cast; remove it once that route exists.
-                onPress={() => router.push("/online" as never)}
+                onPress={() => router.push("/online")}
```

- [ ] **Step 3: Regenerate Expo Router's typed-routes file**

Same discovery from the prior plan — `expo export` doesn't regenerate
`.expo/types/router.d.ts`, only `expo start`'s dev server does:
```bash
cd /Users/munurcoskun/Claude/321guess/apps/web
npx expo start --web --non-interactive > /tmp/expo-start-typegen.log 2>&1 &
EXPO_PID=$!
sleep 8
kill $EXPO_PID 2>/dev/null
pkill -f "expo start" 2>/dev/null
grep -o '`/online`' .expo/types/router.d.ts
```
Expected: prints `` `/online` ``, confirming the route is now known.

- [ ] **Step 4: Verify TypeScript compiles with no casts needed**

```bash
npx tsc --noEmit
```
Expected: clean — this is the first plan where every `router.push` call
in the app resolves to a real route with no `as never` escape hatch left.

- [ ] **Step 5: Verify the web export succeeds**

```bash
npx expo export -p web
```
Expected: 6 static routes now (`/`, `/manual`, `/play`, `/online`,
`/_sitemap`, `/+not-found`).

- [ ] **Step 6: Live browser verification (the only way to actually confirm this screen works)**

With `apps/api`'s dev server running (`cd apps/api && npm run dev`) and
`apps/web`'s dev server running (`npx expo start --web`), use Playwright
to click through:
1. Navigate to `/online` — should show the username registration form
   (not a blank/broken page — confirm zero console errors, same
   CORS-catching technique that found the prior plan's bug).
2. Register a test username, confirm it transitions to the matchup
   preview screen with 5 club-pair logo tiles.
3. Click "Başla" (start), confirm it transitions to the playing phase
   with a visible timer and the first matchup.
4. Type a partial player name into the guess input, confirm the
   dropdown filters and a selection registers as found/wrong.
5. Click "Bitir" (finish early), confirm it reaches the results screen
   with a score, and that the leaderboard section loads (even if empty).

Record any console errors exactly like the CORS bug was caught — do not
consider this task done on "it type-checks," only on "it works when
clicked through."

- [ ] **Step 7: Confirm `apps/api` and `packages/core` are unaffected**

```bash
cd /Users/munurcoskun/Claude/321guess
npm test
```
Expected: 27/27 (unchanged from before this plan).

- [ ] **Step 8: Commit**

```bash
rm -rf apps/web/dist apps/web/.expo
git add apps/web/src/app/online.tsx apps/web/src/components/SetupScreen.tsx
git commit -m "Wire /online route; remove the temporary router typing cast

Live-browser-verified via Playwright: registration -> matchup preview ->
countdown-free direct-start -> playing phase with a working guess dropdown
-> finish -> results with leaderboard. [Fill in the actual finding here
if verification surfaces something — do not commit this message
unedited if Step 6 found a real bug; fix it first, same as the CORS bug
in the prior plan.]"
```

---

## What's next

The app is now functionally complete across all four screens (Manual,
Setup/Play, Online) plus the shared backend. Per the earlier discussion
with the human partner, the next phase is a single, consolidated visual
design pass across the whole app (custom icons instead of emoji,
real spacing/typography polish, press-state feedback, possibly restoring
some of the animations/transitions simplified during these functional
ports) — rather than continuing to port screen-by-screen. Push
notification wiring (the original motivation for this whole migration)
is the phase after that.
