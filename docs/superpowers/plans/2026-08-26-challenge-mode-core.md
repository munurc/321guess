# Challenge Mode Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core async head-to-head "Meydan Oku" (Challenge Mode) mechanic — targeted challenges (search or link) and a server-decided random-opponent queue — as a new top-level mode alongside Daily Challenge and the (renamed) offline modes.

**Architecture:** Five new Postgres tables mirroring the existing `daily_*` schema's shape and conventions exactly. New `apps/api/app/api/challenges/*` routes reuse `packages/core`'s round-generation engine unchanged. The existing Expo-push infrastructure (`push_tokens`, `expo-server-sdk`) is generalized from a daily-cron-only broadcast into a reusable send-to-one-player helper. Client-side, a new `ChallengeScreen` follows the same "one component, multiple phases via state" pattern already used by `OnlineScreen`, and two pieces of that screen's UI (the settings picker, the playing-phase UI) are extracted out of `SetupScreen`/`OnlineScreen` into shared components so neither screen duplicates ~150 lines of JSX.

**Tech Stack:** Next.js API routes (apps/api), Supabase/Postgres, Expo Router + React Native + NativeWind (apps/web), `packages/core` (unchanged), vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-challenge-mode-design.md` (this plan implements everything in that spec except the "Account Linking" section, which is `docs/superpowers/plans/2026-08-26-challenge-mode-account-linking.md`)

## Global Constraints

- Every new table follows `apps/api/supabase/schema.sql`'s RLS convention: `alter table ... enable row level security;` with **no policies** — access is service-role-only via `apps/api`'s server-side Supabase client (`lib/supabase.ts`). Never add a policy.
- Every new API route: exports `OPTIONS` returning `new NextResponse(null, { status: 204 })` (CORS preflight), validates `token` against `UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, returns `{ error: "invalid_body" }` (400) / `{ error: "unknown_player" }` (401) / `{ error: "server_error", message }` (500) on the existing error paths — copy `apps/api/app/api/online/guess/route.ts`'s shape exactly.
- A "challenge round" is always **5 questions** (`QUESTIONS_PER_ROUND = 5`, same constant name/value as `apps/api/lib/daily-round.ts`), club×club or country×club per the challenge's `mode`.
- Random Opponent mode is always: `difficulty: "easy"`, `mode: "clubClub"`, `includedLeagues: RANDOM_LEAGUE_IDS` (below). Never configurable by the player.
- `RANDOM_LEAGUE_IDS` (from `apps/api/public/data/leagues.json`): `["Q82595", "Q167541", "Q324867", "Q13394", "Q9448", "Q15804", "Q485568"]` (Bundesliga, Eredivisie, La Liga, Ligue 1, Premier League, Serie A, Süper Lig).
- A challenge expires 7 days after `created_at` (`expires_at default (now() + interval '7 days')`).
- No native offline behavior changes. `Platform.OS !== "web"` gates every new screen exactly like existing ones — Challenge Mode is native-only for this plan (web's `SetupScreen` branch, `HomeSeoContent`, `PageMeta` are never touched).
- Client identity is the existing `{token, username}` from `apps/web/src/lib/online-storage.ts`'s `loadIdentity()` — no new identity storage. A player who has never opened Daily Challenge/registered a username must be sent through the *existing* registration UI before Challenge Mode screens are reachable (same as Daily Challenge today).

---

### Task 1: `challenges.sql` schema migration

**Files:**
- Create: `apps/api/supabase/challenges.sql`

**Interfaces:**
- Produces: tables `challenges`, `challenge_questions`, `challenge_guesses`, `challenge_scores`, `rivalries`; column `online_players.auth_user_id` (nullable, unused until the account-linking plan, but added here since it's a one-line `alter table` and keeping all schema changes for this feature in one migration file avoids a second near-empty migration later).

- [ ] **Step 1: Write the migration file**

```sql
-- 321guess Challenge Mode — additive migration, run after schema.sql and
-- push_tokens.sql in the Supabase SQL editor. Does not alter any existing
-- table's columns or constraints (online_players.auth_user_id is new and
-- nullable). Same RLS convention as schema.sql: enable RLS, no policies,
-- service-role-only access via apps/api's Supabase client.

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  creator_token uuid not null references online_players(player_token),
  opponent_token uuid references online_players(player_token),
  -- Null until /send decides 'invite' vs 'link' for a friend challenge;
  -- /random sets 'random' immediately since that's known at creation time.
  delivery_type text check (delivery_type in ('invite', 'link', 'random')),
  mode text not null,
  difficulty text not null,
  included_leagues text[] not null,
  status text not null default 'waiting' check (status in ('waiting', 'pending', 'completed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists challenges_queue_idx
  on challenges (created_at asc)
  where delivery_type = 'random' and opponent_token is null and status = 'waiting';

create index if not exists challenges_opponent_idx on challenges (opponent_token);
create index if not exists challenges_creator_idx on challenges (creator_token);

create table if not exists challenge_questions (
  challenge_id uuid not null references challenges(id),
  question_index integer not null,
  club_a_id text not null,
  club_a_name text not null,
  club_a_logo_url text not null,
  club_b_id text not null,
  club_b_name text not null,
  club_b_logo_url text not null,
  answer_player_ids text[] not null,
  primary key (challenge_id, question_index)
);

create table if not exists challenge_guesses (
  challenge_id uuid not null references challenges(id),
  question_index integer not null,
  player_token uuid not null references online_players(player_token),
  guessed_player_id text not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, question_index, player_token, guessed_player_id)
);

create table if not exists challenge_scores (
  challenge_id uuid not null references challenges(id),
  player_token uuid not null references online_players(player_token),
  username text not null,
  correct_count integer not null,
  total_possible integer not null,
  duration_ms integer not null,
  finished_at timestamptz not null default now(),
  primary key (challenge_id, player_token)
);

-- Always stored with player_a_token < player_b_token so each pair has one row.
create table if not exists rivalries (
  player_a_token uuid not null references online_players(player_token),
  player_b_token uuid not null references online_players(player_token),
  player_a_wins integer not null default 0,
  player_b_wins integer not null default 0,
  ties integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_a_token, player_b_token),
  check (player_a_token < player_b_token)
);

alter table online_players add column if not exists auth_user_id uuid references auth.users(id);

alter table challenges enable row level security;
alter table challenge_questions enable row level security;
alter table challenge_guesses enable row level security;
alter table challenge_scores enable row level security;
alter table rivalries enable row level security;
```

- [ ] **Step 2: Apply it**

Run the file's contents in the Supabase SQL editor for the project (same manual process used for `push_tokens.sql` — there is no migration runner in this codebase). Confirm no errors and that all 5 tables plus the new column appear in the Supabase table browser.

- [ ] **Step 3: Commit**

```bash
git add apps/api/supabase/challenges.sql
git commit -m "Add Challenge Mode database schema"
```

---

### Task 2: Rivalry pure logic

**Files:**
- Create: `apps/api/lib/rivalry.ts`
- Test: `apps/api/lib/rivalry.test.ts`

**Interfaces:**
- Produces: `canonicalPair(tokenX: string, tokenY: string): [string, string]`, `type RivalryTotals = { playerAWins: number; playerBWins: number; ties: number }`, `applyResult(current: RivalryTotals, playerAToken: string, playerBToken: string, winnerToken: string | null): RivalryTotals` (`winnerToken: null` means a tie).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { applyResult, canonicalPair } from "./rivalry";

describe("canonicalPair", () => {
  it("returns tokens in ascending order regardless of input order", () => {
    expect(canonicalPair("b-token", "a-token")).toEqual(["a-token", "b-token"]);
    expect(canonicalPair("a-token", "b-token")).toEqual(["a-token", "b-token"]);
  });
});

describe("applyResult", () => {
  const zero = { playerAWins: 0, playerBWins: 0, ties: 0 };

  it("increments playerAWins when player A's token is the winner", () => {
    const result = applyResult(zero, "a-token", "b-token", "a-token");
    expect(result).toEqual({ playerAWins: 1, playerBWins: 0, ties: 0 });
  });

  it("increments playerBWins when player B's token is the winner", () => {
    const result = applyResult(zero, "a-token", "b-token", "b-token");
    expect(result).toEqual({ playerAWins: 0, playerBWins: 1, ties: 0 });
  });

  it("increments ties when winnerToken is null", () => {
    const result = applyResult(zero, "a-token", "b-token", null);
    expect(result).toEqual({ playerAWins: 0, playerBWins: 0, ties: 1 });
  });

  it("accumulates onto existing non-zero totals", () => {
    const current = { playerAWins: 3, playerBWins: 1, ties: 2 };
    const result = applyResult(current, "a-token", "b-token", "a-token");
    expect(result).toEqual({ playerAWins: 4, playerBWins: 1, ties: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run lib/rivalry.test.ts`
Expected: FAIL with "Cannot find module './rivalry'"

- [ ] **Step 3: Write the implementation**

```typescript
export function canonicalPair(tokenX: string, tokenY: string): [string, string] {
  return tokenX < tokenY ? [tokenX, tokenY] : [tokenY, tokenX];
}

export type RivalryTotals = { playerAWins: number; playerBWins: number; ties: number };

/** Pure update of a rivalry row's totals given who won this one challenge.
 * playerAToken/playerBToken must already be in canonical order (call
 * canonicalPair first) — this function does not reorder them. */
export function applyResult(
  current: RivalryTotals,
  playerAToken: string,
  playerBToken: string,
  winnerToken: string | null,
): RivalryTotals {
  if (winnerToken === null) {
    return { ...current, ties: current.ties + 1 };
  }
  if (winnerToken === playerAToken) {
    return { ...current, playerAWins: current.playerAWins + 1 };
  }
  if (winnerToken === playerBToken) {
    return { ...current, playerBWins: current.playerBWins + 1 };
  }
  throw new Error("winnerToken must be playerAToken, playerBToken, or null");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run lib/rivalry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/rivalry.ts apps/api/lib/rivalry.test.ts
git commit -m "Add pure rivalry-score update logic"
```

---

### Task 3: Challenge eligibility pure logic

**Files:**
- Create: `apps/api/lib/challenge-eligibility.ts`
- Test: `apps/api/lib/challenge-eligibility.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type MatchableChallenge = { id: string; creatorToken: string; opponentToken: string | null; deliveryType: string | null; status: string; expiresAt: string }`, `isExpired(expiresAt: string, now: Date): boolean`, `isMatchableRandomChallenge(challenge: MatchableChallenge, requesterToken: string, now: Date): boolean`. Task 5 (`challenge-db.ts`) calls both.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { isExpired, isMatchableRandomChallenge } from "./challenge-eligibility";

describe("isExpired", () => {
  it("is false when expiresAt is in the future", () => {
    expect(isExpired("2026-01-10T00:00:00Z", new Date("2026-01-05T00:00:00Z"))).toBe(false);
  });

  it("is true when expiresAt is in the past", () => {
    expect(isExpired("2026-01-01T00:00:00Z", new Date("2026-01-05T00:00:00Z"))).toBe(true);
  });
});

describe("isMatchableRandomChallenge", () => {
  const now = new Date("2026-01-05T00:00:00Z");
  const base = {
    id: "c1",
    creatorToken: "creator-token",
    opponentToken: null,
    deliveryType: "random",
    status: "waiting",
    expiresAt: "2026-01-10T00:00:00Z",
  };

  it("is matchable when random, unclaimed, waiting, not expired, and requester isn't the creator", () => {
    expect(isMatchableRandomChallenge(base, "other-token", now)).toBe(true);
  });

  it("is not matchable when the requester is the creator", () => {
    expect(isMatchableRandomChallenge(base, "creator-token", now)).toBe(false);
  });

  it("is not matchable when already claimed", () => {
    expect(isMatchableRandomChallenge({ ...base, opponentToken: "someone" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when delivery type isn't random", () => {
    expect(isMatchableRandomChallenge({ ...base, deliveryType: "link" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when status isn't waiting", () => {
    expect(isMatchableRandomChallenge({ ...base, status: "completed" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when expired", () => {
    expect(isMatchableRandomChallenge({ ...base, expiresAt: "2026-01-01T00:00:00Z" }, "other-token", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run lib/challenge-eligibility.test.ts`
Expected: FAIL with "Cannot find module './challenge-eligibility'"

- [ ] **Step 3: Write the implementation**

```typescript
export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export type MatchableChallenge = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
  deliveryType: string | null;
  status: string;
  expiresAt: string;
};

/** Whether `requesterToken` may be matched into `challenge` via
 * POST /api/challenges/random. Pure predicate — the actual atomic claim
 * (concurrency-safe against other requesters) happens in the SQL query
 * in challenge-db.ts; this function documents/tests the eligibility rule
 * that query implements. */
export function isMatchableRandomChallenge(
  challenge: MatchableChallenge,
  requesterToken: string,
  now: Date,
): boolean {
  return (
    challenge.deliveryType === "random" &&
    challenge.opponentToken === null &&
    challenge.status === "waiting" &&
    challenge.creatorToken !== requesterToken &&
    !isExpired(challenge.expiresAt, now)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run lib/challenge-eligibility.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/challenge-eligibility.ts apps/api/lib/challenge-eligibility.test.ts
git commit -m "Add pure challenge-expiration and random-match-eligibility logic"
```

---

### Task 4: Challenge round generation

**Files:**
- Create: `apps/api/lib/challenge-round.ts`
- Test: `apps/api/lib/challenge-round.test.ts`

**Interfaces:**
- Consumes: `buildPool`, `pickRound` from `@321guess/core` (unchanged); `Settings`, `Round` types from `@321guess/core`.
- Produces: `RANDOM_LEAGUE_IDS: string[]`, `QUESTIONS_PER_ROUND = 5`, `type ChallengeMatchup = { round: Round }`, `pickChallengeQuestions(settings: Settings, count: number): Promise<ChallengeMatchup[]>`. Task 5 (`challenge-db.ts`) calls `pickChallengeQuestions` to build the rows for `challenge_questions`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { pickChallengeQuestions, QUESTIONS_PER_ROUND, RANDOM_LEAGUE_IDS } from "./challenge-round";
import type { Settings } from "@321guess/core";

const randomSettings: Settings = {
  mode: "clubClub",
  difficulty: "easy",
  includedLeagues: RANDOM_LEAGUE_IDS,
  excludedCountries: [],
};

describe("pickChallengeQuestions", () => {
  it("returns QUESTIONS_PER_ROUND distinct matchups for the fixed random settings", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    expect(matchups).toHaveLength(QUESTIONS_PER_ROUND);
    const pairKeys = matchups.map((m) => {
      if (m.round.kind !== "clubClub") throw new Error("expected clubClub");
      return [m.round.clubA.id, m.round.clubB.id].sort().join("|");
    });
    expect(new Set(pairKeys).size).toBe(QUESTIONS_PER_ROUND);
  });

  it("only uses clubs from the 7-league random pool", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    for (const m of matchups) {
      if (m.round.kind !== "clubClub") throw new Error("expected clubClub");
      expect(RANDOM_LEAGUE_IDS).toContain(m.round.clubA.leagueId);
      expect(RANDOM_LEAGUE_IDS).toContain(m.round.clubB.leagueId);
    }
  });

  it("respects an arbitrary caller-provided mode/difficulty/leagues (targeted-challenge path)", async () => {
    const settings: Settings = {
      mode: "countryClub",
      difficulty: "hard",
      includedLeagues: ["Q9448"], // Premier League only
      excludedCountries: [],
    };
    const matchups = await pickChallengeQuestions(settings, 3);
    expect(matchups.length).toBeGreaterThan(0);
    for (const m of matchups) expect(m.round.kind).toBe("countryClub");
  });

  it("every question has at least one correct answer", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    for (const m of matchups) expect(m.round.correctPlayers.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx vitest run lib/challenge-round.test.ts`
Expected: FAIL with "Cannot find module './challenge-round'"

- [ ] **Step 3: Write the implementation**

```typescript
import { buildPool, pickRound } from "@321guess/core";
import { loadServerDataset } from "./server-dataset";
import type { Round, Settings } from "@321guess/core";

export const QUESTIONS_PER_ROUND = 5;

// Bundesliga, Eredivisie, La Liga, Ligue 1, Premier League, Serie A, Süper
// Lig — see Global Constraints in docs/superpowers/plans/2026-08-26-challenge-mode-core.md
// for why these 7 and not the other 8 leagues in leagues.json.
export const RANDOM_LEAGUE_IDS = ["Q82595", "Q167541", "Q324867", "Q13394", "Q9448", "Q15804", "Q485568"];

export type ChallengeMatchup = { round: Round };

function pairKey(round: Round): string {
  return round.kind === "clubClub"
    ? [round.clubA.id, round.clubB.id].sort().join("|")
    : `${round.country.code}|${round.club.id}`;
}

/** Generates `count` distinct questions for a challenge round, given
 * arbitrary settings — used both for a targeted challenge (creator's own
 * mode/difficulty/league picks) and for Random Opponent (always the fixed
 * settings built from RANDOM_LEAGUE_IDS). Mirrors
 * apps/api/lib/daily-round.ts's pickDailyQuestions loop shape, but reuses
 * pickRound (not a curated club-id allowlist) since challenges aren't
 * pinned to one club pool the way Daily Challenge is. */
export async function pickChallengeQuestions(settings: Settings, count: number): Promise<ChallengeMatchup[]> {
  const dataset = await loadServerDataset();
  const pool = buildPool(dataset, settings);
  const excludedCountries = new Set(settings.excludedCountries);

  const matchups: ChallengeMatchup[] = [];
  const usedPairs = new Set<string>();
  const maxAttempts = count * 20;
  for (let attempt = 0; matchups.length < count && attempt < maxAttempts; attempt++) {
    const seed = Date.now() + attempt;
    const round = pickRound(pool, settings.mode, excludedCountries, settings.difficulty, seed);
    if (!round) continue;
    const key = pairKey(round);
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);
    matchups.push({ round });
  }
  return matchups;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run lib/challenge-round.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/lib/challenge-round.ts apps/api/lib/challenge-round.test.ts
git commit -m "Add challenge round generation (targeted + fixed random settings)"
```

---

### Task 5: Challenge database access layer

**Files:**
- Create: `apps/api/lib/challenge-db.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `./supabase`; `ChallengeMatchup`, `pickChallengeQuestions` from `./challenge-round`; `canonicalPair`, `applyResult`, `RivalryTotals` from `./rivalry`; `isMatchableRandomChallenge` from `./challenge-eligibility`.
- Produces (consumed by Tasks 8–14's routes):
  - `type ChallengeQuestionRow = { index: number; clubA: {id,name,logoUrl}; clubB: {id,name,logoUrl}; totalPossible: number }` (deliberately **no** `answerPlayerIds` — that must never reach the client for a question the player hasn't answered yet, same principle as Daily Challenge's `RoundInfo`. Internal code that needs the real answer key calls `getChallengeQuestionAnswers` below instead of reading it off a `ChallengeRow`.)
  - `type ChallengeRow = { id: string; creatorToken: string; opponentToken: string | null; deliveryType: string | null; mode: string; difficulty: string; includedLeagues: string[]; status: string; createdAt: string; expiresAt: string; questions: ChallengeQuestionRow[] }`
  - `createChallenge(creatorToken: string, settings: Settings): Promise<ChallengeRow>`
  - `getChallenge(id: string): Promise<ChallengeRow | null>`
  - `getChallengeQuestionAnswers(challengeId: string, questionIndex: number): Promise<string[] | null>` — the only place the real answer key is readable; called directly by the guess/finish routes (Tasks 9–10), never exposed via `ChallengeRow`.
  - `setChallengeDelivery(id: string, delivery: "invite" | "link", opponentToken: string | null): Promise<void>`
  - `claimChallengeAsOpponent(id: string, opponentToken: string): Promise<ChallengeRow | null>` (returns `null` if already claimed by someone else)
  - `matchOrCreateRandomChallenge(requesterToken: string): Promise<{ challenge: ChallengeRow; role: "creator" | "opponent" }>`
  - `recordChallengeGuess(challengeId, questionIndex, token, playerId, correct): Promise<{ isNew: boolean }>`
  - `countCorrectChallengeGuesses(challengeId, token): Promise<number>`
  - `finishChallenge(challengeId, token, username, totalPossible): Promise<{ correctCount: number; totalPossible: number; completed: boolean; opponentToken: string | null }>` (`completed: true` once both sides have a `challenge_scores` row; on the transition to completed, also updates `rivalries`)
  - `listChallengesForPlayer(playerToken: string): Promise<{ incoming: ChallengeRow[]; outgoing: ChallengeRow[]; completed: (ChallengeRow & { rivalry: RivalryTotals; opponentUsername: string })[] }>`
  - `searchPlayers(query: string, limit: number): Promise<{ username: string }[]>`

- [ ] **Step 1: Write the implementation**

```typescript
import { getSupabaseServerClient } from "./supabase";
import { pickChallengeQuestions, QUESTIONS_PER_ROUND, RANDOM_LEAGUE_IDS } from "./challenge-round";
import { applyResult, canonicalPair, type RivalryTotals } from "./rivalry";
import { isMatchableRandomChallenge } from "./challenge-eligibility";
import type { Settings } from "@321guess/core";

type ClubRef = { id: string; name: string; logoUrl: string };

export type ChallengeQuestionRow = {
  index: number;
  clubA: ClubRef;
  clubB: ClubRef;
  totalPossible: number;
};

export type ChallengeRow = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
  deliveryType: "invite" | "link" | "random" | null;
  mode: string;
  difficulty: string;
  includedLeagues: string[];
  status: "waiting" | "pending" | "completed";
  createdAt: string;
  expiresAt: string;
  questions: ChallengeQuestionRow[];
};

function mapChallengeRow(row: any, questionRows: any[]): ChallengeRow {
  return {
    id: row.id,
    creatorToken: row.creator_token,
    opponentToken: row.opponent_token,
    deliveryType: row.delivery_type,
    mode: row.mode,
    difficulty: row.difficulty,
    includedLeagues: row.included_leagues,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    questions: questionRows
      .sort((a, b) => a.question_index - b.question_index)
      .map((q) => ({
        index: q.question_index,
        clubA: { id: q.club_a_id, name: q.club_a_name, logoUrl: q.club_a_logo_url },
        clubB: { id: q.club_b_id, name: q.club_b_name, logoUrl: q.club_b_logo_url },
        totalPossible: q.answer_player_ids.length,
      })),
  };
}

// Returns the raw inserted rows (snake_case, matching the challenge_questions
// table) rather than a mapped ChallengeQuestionRow[] — callers feed these
// straight into mapChallengeRow, which is the ONE place snake_case becomes
// the client-facing camelCase shape (and the one place that must never
// forward answer_player_ids as-is; see mapChallengeRow above).
async function insertQuestions(challengeId: string, settings: Settings) {
  const supabase = getSupabaseServerClient();
  const matchups = await pickChallengeQuestions(settings, QUESTIONS_PER_ROUND);
  const rows = matchups.map((m, index) => {
    if (m.round.kind === "clubClub") {
      return {
        challenge_id: challengeId,
        question_index: index,
        club_a_id: m.round.clubA.id,
        club_a_name: m.round.clubA.name,
        club_a_logo_url: m.round.clubA.logoUrl,
        club_b_id: m.round.clubB.id,
        club_b_name: m.round.clubB.name,
        club_b_logo_url: m.round.clubB.logoUrl,
        answer_player_ids: m.round.correctPlayers.map((p) => p.id),
      };
    }
    // countryClub: store the country's "club slot" as clubA (flag), the
    // actual club as clubB — ChallengeQuestionRow has no separate country
    // field, matching how the client only ever needs two logo/flag tiles.
    return {
      challenge_id: challengeId,
      question_index: index,
      club_a_id: m.round.country.code,
      club_a_name: m.round.country.nameEn,
      club_a_logo_url: m.round.country.flagUrl,
      club_b_id: m.round.club.id,
      club_b_name: m.round.club.name,
      club_b_logo_url: m.round.club.logoUrl,
      answer_player_ids: m.round.correctPlayers.map((p) => p.id),
    };
  });
  const { error } = await supabase.from("challenge_questions").insert(rows);
  if (error) throw error;
  return rows;
}

export async function createChallenge(creatorToken: string, settings: Settings): Promise<ChallengeRow> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("challenges")
    .insert({
      creator_token: creatorToken,
      mode: settings.mode,
      difficulty: settings.difficulty,
      included_leagues: settings.includedLeagues,
    })
    .select()
    .single();
  if (error) throw error;

  const questionRows = await insertQuestions(row.id, settings);
  return mapChallengeRow(row, questionRows);
}

export async function getChallenge(id: string): Promise<ChallengeRow | null> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase.from("challenges").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: questionRows, error: qError } = await supabase
    .from("challenge_questions")
    .select("*")
    .eq("challenge_id", id);
  if (qError) throw qError;

  return mapChallengeRow(row, questionRows ?? []);
}

export async function setChallengeDelivery(
  id: string,
  delivery: "invite" | "link",
  opponentToken: string | null,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("challenges")
    .update({
      delivery_type: delivery,
      opponent_token: opponentToken,
      status: opponentToken ? "pending" : "waiting",
    })
    .eq("id", id);
  if (error) throw error;
}

/** Atomically claims an unclaimed link/random challenge for `opponentToken`
 * — the conditional `.eq("opponent_token", null)` in the UPDATE means a
 * concurrent second claim attempt affects zero rows and gets null back,
 * rather than racing to overwrite the first claimant. */
export async function claimChallengeAsOpponent(id: string, opponentToken: string): Promise<ChallengeRow | null> {
  const supabase = getSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("challenges")
    .update({ opponent_token: opponentToken, status: "pending" })
    .eq("id", id)
    .is("opponent_token", null)
    .select();
  if (error) throw error;
  if (!rows || rows.length === 0) return null;
  return getChallenge(id);
}

/** Implements the Random Opponent flow: claim the oldest waiting random
 * challenge not created by `requesterToken` if one exists (becoming its
 * opponent, role: "opponent" — the creator already played, so this
 * player's result screen appears immediately after they finish); otherwise
 * create a brand-new one with the fixed random settings (role: "creator",
 * waiting for a future match). Supabase's PostgREST doesn't expose raw
 * `FOR UPDATE SKIP LOCKED`, so this uses the same conditional-UPDATE
 * pattern as claimChallengeAsOpponent for the race-safety that gives —
 * two simultaneous requesters can each successfully claim DIFFERENT
 * waiting rows, and if both try the same row only one UPDATE affects it. */
export async function matchOrCreateRandomChallenge(
  requesterToken: string,
): Promise<{ challenge: ChallengeRow; role: "creator" | "opponent" }> {
  const supabase = getSupabaseServerClient();
  const { data: candidates, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("delivery_type", "random")
    .eq("status", "waiting")
    .is("opponent_token", null)
    .neq("creator_token", requesterToken)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) throw error;

  const now = new Date();
  for (const candidate of candidates ?? []) {
    const matchable = isMatchableRandomChallenge(
      {
        id: candidate.id,
        creatorToken: candidate.creator_token,
        opponentToken: candidate.opponent_token,
        deliveryType: candidate.delivery_type,
        status: candidate.status,
        expiresAt: candidate.expires_at,
      },
      requesterToken,
      now,
    );
    if (!matchable) continue;
    const claimed = await claimChallengeAsOpponent(candidate.id, requesterToken);
    if (claimed) return { challenge: claimed, role: "opponent" };
    // Lost the race for this one — try the next candidate.
  }

  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: RANDOM_LEAGUE_IDS,
    excludedCountries: [],
  };
  const { data: row, error: insertError } = await supabase
    .from("challenges")
    .insert({
      creator_token: requesterToken,
      delivery_type: "random",
      mode: settings.mode,
      difficulty: settings.difficulty,
      included_leagues: settings.includedLeagues,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const questionRows = await insertQuestions(row.id, settings);
  const challenge = mapChallengeRow(row, questionRows);
  return { challenge, role: "creator" };
}

export async function recordChallengeGuess(
  challengeId: string,
  questionIndex: number,
  token: string,
  playerId: string,
  correct: boolean,
): Promise<{ isNew: boolean }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_guesses")
    .upsert(
      { challenge_id: challengeId, question_index: questionIndex, player_token: token, guessed_player_id: playerId, correct },
      { onConflict: "challenge_id,question_index,player_token,guessed_player_id", ignoreDuplicates: true },
    )
    .select();
  if (error) throw error;
  return { isNew: (data?.length ?? 0) > 0 };
}

export async function countCorrectChallengeGuesses(challengeId: string, token: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("challenge_guesses")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challengeId)
    .eq("player_token", token)
    .eq("correct", true);
  if (error) throw error;
  return count ?? 0;
}

export type FinishChallengeResult = {
  correctCount: number;
  totalPossible: number;
  completed: boolean;
  opponentToken: string | null;
  opponentResult: { correctCount: number; totalPossible: number; username: string } | null;
};

/** Locks in this player's score for the challenge (idempotent — a repeat
 * call reads back the original result, same pattern as
 * lib/online-db.ts's finishRound), then checks whether the OTHER side has
 * already finished. On the transition where both sides now have a score
 * (this call is whichever of the two finishes second), marks the
 * challenge completed and updates the rivalries row. */
export async function finishChallenge(
  challengeId: string,
  token: string,
  username: string,
  totalPossible: number,
): Promise<FinishChallengeResult> {
  const supabase = getSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("challenge_scores")
    .select("correct_count")
    .eq("challenge_id", challengeId)
    .eq("player_token", token)
    .maybeSingle();
  if (existingError) throw existingError;

  let correctCount: number;
  if (existing) {
    correctCount = existing.correct_count;
  } else {
    correctCount = await countCorrectChallengeGuesses(challengeId, token);
    const { error: insertError } = await supabase.from("challenge_scores").insert({
      challenge_id: challengeId,
      player_token: token,
      username,
      correct_count: correctCount,
      total_possible: totalPossible,
      duration_ms: 0,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }

  const { data: challengeRow, error: challengeError } = await supabase
    .from("challenges")
    .select("creator_token, opponent_token")
    .eq("id", challengeId)
    .single();
  if (challengeError) throw challengeError;

  const otherToken = challengeRow.creator_token === token ? challengeRow.opponent_token : challengeRow.creator_token;
  if (!otherToken) {
    return { correctCount, totalPossible, completed: false, opponentToken: null, opponentResult: null };
  }

  const { data: otherScore, error: otherError } = await supabase
    .from("challenge_scores")
    .select("correct_count, total_possible, username")
    .eq("challenge_id", challengeId)
    .eq("player_token", otherToken)
    .maybeSingle();
  if (otherError) throw otherError;

  if (!otherScore) {
    return { correctCount, totalPossible, completed: false, opponentToken: otherToken, opponentResult: null };
  }

  // Both sides have now finished — this call is the second one. Mark
  // completed and update the rivalry (idempotent via the challenges.status
  // check: a retried finishRound call after completion just returns the
  // same result without re-applying the rivalry update).
  const { data: alreadyCompleted } = await supabase
    .from("challenges")
    .select("status")
    .eq("id", challengeId)
    .single();

  if (alreadyCompleted?.status !== "completed") {
    await supabase.from("challenges").update({ status: "completed" }).eq("id", challengeId);

    const winnerToken =
      correctCount === otherScore.correct_count
        ? null
        : correctCount > otherScore.correct_count
          ? token
          : otherToken;
    const [playerAToken, playerBToken] = canonicalPair(token, otherToken);

    const { data: rivalryRow } = await supabase
      .from("rivalries")
      .select("player_a_wins, player_b_wins, ties")
      .eq("player_a_token", playerAToken)
      .eq("player_b_token", playerBToken)
      .maybeSingle();

    const current: RivalryTotals = rivalryRow
      ? { playerAWins: rivalryRow.player_a_wins, playerBWins: rivalryRow.player_b_wins, ties: rivalryRow.ties }
      : { playerAWins: 0, playerBWins: 0, ties: 0 };
    const updated = applyResult(current, playerAToken, playerBToken, winnerToken);

    await supabase.from("rivalries").upsert(
      {
        player_a_token: playerAToken,
        player_b_token: playerBToken,
        player_a_wins: updated.playerAWins,
        player_b_wins: updated.playerBWins,
        ties: updated.ties,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_a_token,player_b_token" },
    );
  }

  return {
    correctCount,
    totalPossible,
    completed: true,
    opponentToken: otherToken,
    opponentResult: {
      correctCount: otherScore.correct_count,
      totalPossible: otherScore.total_possible,
      username: otherScore.username,
    },
  };
}

/** The only place the real answer key for a question is readable — called
 * directly by the guess/finish routes, never exposed via ChallengeRow
 * (whose ChallengeQuestionRow only carries totalPossible). */
export async function getChallengeQuestionAnswers(challengeId: string, questionIndex: number): Promise<string[] | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_questions")
    .select("answer_player_ids")
    .eq("challenge_id", challengeId)
    .eq("question_index", questionIndex)
    .maybeSingle();
  if (error) throw error;
  return data?.answer_player_ids ?? null;
}

export async function listChallengesForPlayer(playerToken: string) {
  const supabase = getSupabaseServerClient();
  const { data: created, error: createdError } = await supabase
    .from("challenges")
    .select("*")
    .eq("creator_token", playerToken)
    .order("created_at", { ascending: false });
  if (createdError) throw createdError;

  const { data: received, error: receivedError } = await supabase
    .from("challenges")
    .select("*")
    .eq("opponent_token", playerToken)
    .order("created_at", { ascending: false });
  if (receivedError) throw receivedError;

  const all = [...(created ?? []), ...(received ?? [])];
  const incoming = all.filter((c) => c.status === "pending" && c.opponent_token === playerToken);
  const outgoing = all.filter((c) => c.status === "waiting" && c.creator_token === playerToken);
  const completedRows = all.filter((c) => c.status === "completed");

  const completed = await Promise.all(
    completedRows.map(async (c) => {
      const opponentToken = c.creator_token === playerToken ? c.opponent_token : c.creator_token;
      const [playerAToken, playerBToken] = canonicalPair(playerToken, opponentToken);
      const { data: rivalryRow } = await supabase
        .from("rivalries")
        .select("player_a_wins, player_b_wins, ties")
        .eq("player_a_token", playerAToken)
        .eq("player_b_token", playerBToken)
        .maybeSingle();
      const rivalry: RivalryTotals = rivalryRow
        ? { playerAWins: rivalryRow.player_a_wins, playerBWins: rivalryRow.player_b_wins, ties: rivalryRow.ties }
        : { playerAWins: 0, playerBWins: 0, ties: 0 };
      const { data: opponentPlayer } = await supabase
        .from("online_players")
        .select("username")
        .eq("player_token", opponentToken)
        .maybeSingle();

      const { data: questionRows } = await supabase
        .from("challenge_questions")
        .select("*")
        .eq("challenge_id", c.id);
      return { ...mapChallengeRow(c, questionRows ?? []), rivalry, opponentUsername: opponentPlayer?.username ?? "?" };
    }),
  );

  const withQuestions = async (rows: any[]) =>
    Promise.all(
      rows.map(async (c) => {
        const { data: questionRows } = await supabase.from("challenge_questions").select("*").eq("challenge_id", c.id);
        return mapChallengeRow(c, questionRows ?? []);
      }),
    );

  return {
    incoming: await withQuestions(incoming),
    outgoing: await withQuestions(outgoing),
    completed,
  };
}

/** Backs the "search an existing user" step of sending a targeted
 * challenge — prefix match against username_lower (schema.sql's generated
 * column), same case-insensitivity the uniqueness constraint already uses. */
export async function searchPlayers(query: string, limit: number): Promise<{ username: string }[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .select("username")
    .ilike("username_lower", `${query.toLowerCase()}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/lib/challenge-db.ts
git commit -m "Add challenge database access layer"
```

---

### Task 6: Generalize push sending

**Files:**
- Modify: `apps/api/lib/fcm.ts`

**Interfaces:**
- Produces: `sendPushToTokens(tokens: string[], title: string, body: string): Promise<BroadcastResult>` (new, exported). `sendDailyBroadcast` keeps its exact existing signature/behavior — Task 7 and the existing cron both keep working unchanged.

- [ ] **Step 1: Refactor `fcm.ts` to extract the shared sender**

```typescript
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

const expo = new Expo();

export type BroadcastResult = { successCount: number; invalidTokens: string[] };

/** Sends one message to a list of Expo push tokens. Tokens Expo's receipt
 * service reports as no-longer-valid are returned so the caller can prune
 * them from push_tokens. Shared by the daily broadcast (sendDailyBroadcast
 * below) and Challenge Mode's per-event notifications
 * (lib/challenge-push.ts) — the only thing that differs between call
 * sites is the title/body text. */
export async function sendPushToTokens(tokens: string[], title: string, body: string): Promise<BroadcastResult> {
  const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return { successCount: 0, invalidTokens: [] };

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({ to, title, body }));

  const tickets: ExpoPushTicket[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
  }

  const invalidTokens: string[] = [];
  let successCount = 0;
  tickets.forEach((ticket, idx) => {
    if (ticket.status === "ok") {
      successCount += 1;
    } else if (ticket.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(validTokens[idx]);
    }
  });

  return { successCount, invalidTokens };
}

/** Sends the generic "today's challenge is ready" push to every given
 * Expo push token. Expo's own delivery layer manages APNs/FCM under the
 * hood — no Firebase or Apple push credentials needed here. */
export async function sendDailyBroadcast(tokens: string[]): Promise<BroadcastResult> {
  return sendPushToTokens(
    tokens,
    "Bugünün challenge'ı hazır!",
    "321guess'te günlük meydan okuma seni bekliyor — hemen oyna.",
  );
}
```

- [ ] **Step 2: Verify the existing cron route still type-checks and its behavior is unchanged**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. `apps/api/app/api/cron/notify-daily-challenge/route.ts` imports `sendDailyBroadcast` unchanged — no edit needed there.

- [ ] **Step 3: Commit**

```bash
git add apps/api/lib/fcm.ts
git commit -m "Generalize push sending into a shared sendPushToTokens helper"
```

---

### Task 7: Per-player push lookup + challenge notification helper

**Files:**
- Modify: `apps/api/lib/push-db.ts`
- Create: `apps/api/lib/challenge-push.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `./supabase`; `sendPushToTokens` from `./fcm` (Task 6).
- Produces: `getPushTokensForPlayer(playerToken: string): Promise<string[]>` (added to `push-db.ts`); `notifyPlayer(playerToken: string, title: string, body: string): Promise<void>` (new file, swallows errors — a failed push must never break the API call that triggered it, same "best-effort" stance as the client's `registerPushToken`).

- [ ] **Step 1: Add the per-player lookup to `push-db.ts`**

Add this function to the existing `apps/api/lib/push-db.ts` (alongside `getAllPushTokens`, `upsertPushToken`, `deletePushTokens` — don't remove or modify those):

```typescript
export async function getPushTokensForPlayer(playerToken: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("push_tokens").select("device_token").eq("player_token", playerToken);
  if (error) throw error;
  return (data ?? []).map((row) => row.device_token);
}
```

- [ ] **Step 2: Write `challenge-push.ts`**

```typescript
import { getPushTokensForPlayer } from "./push-db";
import { sendPushToTokens } from "./fcm";

/** Best-effort push to one player's device(s) — used for "X sana meydan
 * okudu" and "sonucun hazır" notifications, triggered inline from
 * /api/challenges/send and /api/challenges/[id]/finish rather than from a
 * cron (contrast lib/fcm.ts's sendDailyBroadcast, which the daily cron
 * calls). Never throws: a push failure must not fail the API call that
 * triggered it — the in-app hub list (GET /api/challenges/list) is always
 * the source of truth regardless of whether this succeeds. */
export async function notifyPlayer(playerToken: string, title: string, body: string): Promise<void> {
  try {
    const tokens = await getPushTokensForPlayer(playerToken);
    if (tokens.length === 0) return;
    await sendPushToTokens(tokens, title, body);
  } catch {
    // Best-effort — see doc comment above.
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/lib/push-db.ts apps/api/lib/challenge-push.ts
git commit -m "Add per-player push lookup and a challenge-notification helper"
```

---

### Task 8: `POST /api/challenges/create`

**Files:**
- Create: `apps/api/app/api/challenges/create/route.ts`

**Interfaces:**
- Consumes: `createChallenge`, `getPlayerByToken` (existing, from `@/lib/online-db`) — wait, `getPlayerByToken` already exists in `online-db.ts`; reuse it, don't duplicate. `createChallenge` from `@/lib/challenge-db` (Task 5).
- Produces: `POST /api/challenges/create` — request `{ token: string; mode: "clubClub"|"countryClub"; difficulty: "easy"|"medium"|"hard"; includedLeagues: string[] }`, response `ChallengeRow` shape as JSON (same field names Task 5 exports, camelCase) on 200.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { createChallenge } from "@/lib/challenge-db";
import type { Difficulty, GameMode } from "@321guess/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: GameMode[] = ["clubClub", "countryClub"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

type Body = { token?: unknown; mode?: unknown; difficulty?: unknown; includedLeagues?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, mode, difficulty, includedLeagues } = body;
  if (
    typeof token !== "string" ||
    !UUID_RE.test(token) ||
    typeof mode !== "string" ||
    !MODES.includes(mode as GameMode) ||
    typeof difficulty !== "string" ||
    !DIFFICULTIES.includes(difficulty as Difficulty) ||
    !Array.isArray(includedLeagues) ||
    includedLeagues.length === 0 ||
    !includedLeagues.every((l) => typeof l === "string")
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await createChallenge(token, {
      mode: mode as GameMode,
      difficulty: difficulty as Difficulty,
      includedLeagues: includedLeagues as string[],
      excludedCountries: [],
    });
    return NextResponse.json(challenge);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/challenges/create/route.ts
git commit -m "Add POST /api/challenges/create"
```

---

### Task 9: `POST /api/challenges/[id]/guess`

**Files:**
- Create: `apps/api/app/api/challenges/[id]/guess/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `getChallenge`, `getChallengeQuestionAnswers`, `recordChallengeGuess`, `countCorrectChallengeGuesses` from `@/lib/challenge-db`.
- Produces: `POST /api/challenges/[id]/guess` — request `{ token, questionIndex, playerId }`, response `{ correct, alreadyGuessed, questionTotalPossible, overallFoundCount, totalPossible }` (same shape as `/api/online/guess`, minus its per-question found-count field, which no client screen in this plan needs).

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import {
  countCorrectChallengeGuesses,
  getChallenge,
  getChallengeQuestionAnswers,
  recordChallengeGuess,
} from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; questionIndex?: unknown; playerId?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, questionIndex, playerId } = body;
  if (
    typeof token !== "string" ||
    !UUID_RE.test(token) ||
    typeof questionIndex !== "number" ||
    !Number.isInteger(questionIndex) ||
    questionIndex < 0 ||
    typeof playerId !== "string" ||
    !playerId
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await getChallenge(id);
    const question = challenge?.questions.find((q) => q.index === questionIndex);
    if (!challenge || !question) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token && challenge.opponentToken !== token) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const answers = await getChallengeQuestionAnswers(id, questionIndex);
    if (!answers) return NextResponse.json({ error: "no_challenge" }, { status: 400 });

    const correct = answers.includes(playerId);
    const { isNew } = await recordChallengeGuess(id, questionIndex, token, playerId, correct);
    const overallFoundCount = await countCorrectChallengeGuesses(id, token);
    const totalPossible = challenge.questions.reduce((sum, q) => sum + q.totalPossible, 0);

    return NextResponse.json({
      correct,
      alreadyGuessed: !isNew,
      questionTotalPossible: question.totalPossible,
      overallFoundCount,
      totalPossible,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/challenges/\[id\]/guess/route.ts
git commit -m "Add POST /api/challenges/[id]/guess"
```

---

### Task 10: `POST /api/challenges/[id]/finish`

**Files:**
- Create: `apps/api/app/api/challenges/[id]/finish/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `getChallenge`, `finishChallenge` from `@/lib/challenge-db`; `notifyPlayer` from `@/lib/challenge-push` (Task 7).
- Produces: `POST /api/challenges/[id]/finish` — request `{ token }`, response `{ correctCount, totalPossible, completed, opponentResult: {correctCount, totalPossible} | null }`.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { finishChallenge, getChallenge } from "@/lib/challenge-db";
import { notifyPlayer } from "@/lib/challenge-push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token } = body;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token && challenge.opponentToken !== token) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const totalPossible = challenge.questions.reduce((sum, q) => sum + q.totalPossible, 0);
    const result = await finishChallenge(id, token, player.username, totalPossible);

    if (result.completed && result.opponentToken) {
      // Whoever just finished second sees the result immediately in this
      // response — this push is for the OTHER player, who finished first
      // and has been waiting.
      await notifyPlayer(
        result.opponentToken,
        "Meydan okuman sonuçlandı!",
        `${player.username} da oynadı — sonucu görmek için dokun.`,
      );
    }

    return NextResponse.json({
      correctCount: result.correctCount,
      totalPossible: result.totalPossible,
      completed: result.completed,
      opponentResult: result.opponentResult,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/challenges/\[id\]/finish/route.ts
git commit -m "Add POST /api/challenges/[id]/finish"
```

---

### Task 11: `POST /api/challenges/[id]/send`

**Files:**
- Create: `apps/api/app/api/challenges/[id]/send/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `getChallenge`, `setChallengeDelivery`, `searchPlayers` (not used here, but the DB layer that resolves a username to a token is a new small helper below) from `@/lib/challenge-db`; `notifyPlayer` from `@/lib/challenge-push`.
- Produces: `POST /api/challenges/[id]/send` — request `{ token, opponentUsername? }`, response `{ deliveryType: "invite" }` or `{ deliveryType: "link", url: string }`.

- [ ] **Step 1: Add a username→token lookup to `challenge-db.ts`**

Add this function to `apps/api/lib/challenge-db.ts` (it belongs there rather than `online-db.ts` since it's specifically for resolving a challenge opponent, reusing the same `online_players` table `online-db.ts` already queries):

```typescript
export async function getPlayerTokenByUsername(username: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .select("player_token")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data?.player_token ?? null;
}
```

- [ ] **Step 2: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { getChallenge, getPlayerTokenByUsername, setChallengeDelivery } from "@/lib/challenge-db";
import { notifyPlayer } from "@/lib/challenge-push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; opponentUsername?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, opponentUsername } = body;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (opponentUsername !== undefined && typeof opponentUsername !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token) return NextResponse.json({ error: "not_the_creator" }, { status: 403 });

    if (opponentUsername) {
      const opponentToken = await getPlayerTokenByUsername(opponentUsername);
      if (!opponentToken) return NextResponse.json({ error: "unknown_username" }, { status: 404 });
      if (opponentToken === token) return NextResponse.json({ error: "cannot_challenge_self" }, { status: 400 });

      await setChallengeDelivery(id, "invite", opponentToken);
      await notifyPlayer(
        opponentToken,
        "Sana meydan okundu!",
        `${player.username} seni bir meydan okumaya davet etti — skorunu geç.`,
      );
      return NextResponse.json({ deliveryType: "invite" });
    }

    await setChallengeDelivery(id, "link", null);
    return NextResponse.json({ deliveryType: "link", url: `https://www.321guess.com/challenge/${id}` });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/lib/challenge-db.ts apps/api/app/api/challenges/\[id\]/send/route.ts
git commit -m "Add POST /api/challenges/[id]/send"
```

---

### Task 12: `GET /api/challenges/[id]` (fetch + claim-on-open)

**Files:**
- Create: `apps/api/app/api/challenges/[id]/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `getChallenge`, `claimChallengeAsOpponent` from `@/lib/challenge-db`.
- Produces: `GET /api/challenges/[id]?token=` — response is `ChallengeRow` JSON on 200.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { claimChallengeAsOpponent, getChallenge } from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    let challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 404 });

    if (challenge.opponentToken === null && challenge.creatorToken !== token) {
      const claimed = await claimChallengeAsOpponent(id, token);
      if (claimed) challenge = claimed;
      // If claiming lost the race (someone else claimed it first between
      // getChallenge and here), fall through and return the challenge as
      // read — the caller will see it's already claimed by someone else
      // and the client shows "bu meydan okuma zaten oynanmış" accordingly.
      else challenge = (await getChallenge(id))!;
    }

    return NextResponse.json(challenge);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/challenges/\[id\]/route.ts
git commit -m "Add GET /api/challenges/[id] with claim-on-open"
```

---

### Task 13: `POST /api/challenges/random`

**Files:**
- Create: `apps/api/app/api/challenges/random/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `matchOrCreateRandomChallenge` from `@/lib/challenge-db`.
- Produces: `POST /api/challenges/random` — request `{ token }`, response `ChallengeRow & { role: "creator" | "opponent" }`.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { matchOrCreateRandomChallenge } from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token } = body;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const { challenge, role } = await matchOrCreateRandomChallenge(token);
    return NextResponse.json({ ...challenge, role });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/challenges/random/route.ts
git commit -m "Add POST /api/challenges/random"
```

---

### Task 14: `GET /api/challenges/list` and `GET /api/online/search`

**Files:**
- Create: `apps/api/app/api/challenges/list/route.ts`
- Create: `apps/api/app/api/online/search/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `listChallengesForPlayer`, `searchPlayers` from `@/lib/challenge-db`.
- Produces: `GET /api/challenges/list?token=` — response `{ incoming: ChallengeRow[]; outgoing: ChallengeRow[]; completed: (ChallengeRow & {rivalry, opponentUsername})[] }`. `GET /api/online/search?q=` — response `{ usernames: string[] }` (no token required — this is a public lookup of existing usernames, same visibility as the leaderboard).

- [ ] **Step 1: Write the list route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { listChallengesForPlayer } from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const result = await listChallengesForPlayer(token);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write the search route**

```typescript
import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/challenge-db";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ usernames: [] });

  try {
    const results = await searchPlayers(q.trim(), 8);
    return NextResponse.json({ usernames: results.map((r) => r.username) });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/api/challenges/list/route.ts apps/api/app/api/online/search/route.ts
git commit -m "Add GET /api/challenges/list and GET /api/online/search"
```

---

### Task 15: Backend regression check

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full apps/api test suite**

Run: `cd apps/api && npx vitest run`
Expected: all tests pass, including the new `rivalry.test.ts`, `challenge-eligibility.test.ts`, `challenge-round.test.ts`, and the pre-existing `daily-round.test.ts`, `color-extract.test.ts`.

- [ ] **Step 2: Type-check the whole app**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test of the new endpoints against a local dev server**

Start `cd apps/api && npm run dev`, then exercise the full targeted-challenge flow with `curl` using two different registered player tokens (register both via the existing `/api/online/register` if needed): create → send (by username) → guess (as opponent) × 5 → finish (as opponent) → finish (as creator, if not already) → list (as either player, confirm it shows up under `completed` with a `rivalry` object). Then exercise `/api/challenges/random` twice with two different tokens and confirm the second call returns `role: "opponent"` against the first call's challenge id.

No commit for this task (verification only) — if anything fails, fix it in the task that introduced the bug and re-run this check.

---

### Task 16: Client API wrapper

**Files:**
- Create: `apps/web/src/lib/challenge-api.ts`

**Interfaces:**
- Consumes: `apiBaseUrl` from `./api-base-url` (existing).
- Produces: `type ChallengeRow` (client-side mirror of the server shape, camelCase, matching Task 5's `ChallengeRow`), `createChallenge`, `sendChallenge`, `fetchChallenge`, `matchRandomChallenge`, `submitChallengeGuess`, `finishChallenge`, `listChallenges`, `searchUsernames` — one function per endpoint, following `apps/web/src/lib/online-api.ts`'s exact error-handling shape (`try/catch`, `res.status === 401` → `"expired"`, `!res.ok` → `"failed"`).

- [ ] **Step 1: Write the client wrapper**

```typescript
import { apiBaseUrl } from "./api-base-url";
import type { Difficulty, GameMode } from "@321guess/core";

type ClubRef = { id: string; name: string; logoUrl: string };
export type ChallengeQuestion = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };
export type ChallengeRow = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
  deliveryType: "invite" | "link" | "random" | null;
  mode: GameMode;
  difficulty: Difficulty;
  includedLeagues: string[];
  status: "waiting" | "pending" | "completed";
  createdAt: string;
  expiresAt: string;
  questions: ChallengeQuestion[];
};

export type ApiResult<T> = { status: "ok"; data: T } | { status: "expired" } | { status: "failed" };

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "failed" };
  }
}

async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`);
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "failed" };
  }
}

export function createChallenge(
  token: string,
  mode: GameMode,
  difficulty: Difficulty,
  includedLeagues: string[],
): Promise<ApiResult<ChallengeRow>> {
  return post("/api/challenges/create", { token, mode, difficulty, includedLeagues });
}

export type SendResult =
  | { deliveryType: "invite" }
  | { deliveryType: "link"; url: string };

export function sendChallenge(
  token: string,
  challengeId: string,
  opponentUsername?: string,
): Promise<ApiResult<SendResult>> {
  return post(`/api/challenges/${challengeId}/send`, { token, opponentUsername });
}

export function fetchChallenge(token: string, challengeId: string): Promise<ApiResult<ChallengeRow>> {
  return get(`/api/challenges/${challengeId}?token=${token}`);
}

export function matchRandomChallenge(token: string): Promise<ApiResult<ChallengeRow & { role: "creator" | "opponent" }>> {
  return post("/api/challenges/random", { token });
}

export type ChallengeGuessResult = {
  correct: boolean;
  alreadyGuessed: boolean;
  questionTotalPossible: number;
  overallFoundCount: number;
  totalPossible: number;
};

export function submitChallengeGuess(
  token: string,
  challengeId: string,
  questionIndex: number,
  playerId: string,
): Promise<ApiResult<ChallengeGuessResult>> {
  return post(`/api/challenges/${challengeId}/guess`, { token, questionIndex, playerId });
}

export type FinishChallengeResult = {
  correctCount: number;
  totalPossible: number;
  completed: boolean;
  opponentResult: { correctCount: number; totalPossible: number; username: string } | null;
};

export function finishChallenge(token: string, challengeId: string): Promise<ApiResult<FinishChallengeResult>> {
  return post(`/api/challenges/${challengeId}/finish`, { token });
}

export type RivalryChallenge = ChallengeRow & { rivalry: { playerAWins: number; playerBWins: number; ties: number }; opponentUsername: string };
export type ChallengeList = { incoming: ChallengeRow[]; outgoing: ChallengeRow[]; completed: RivalryChallenge[] };

export function listChallenges(token: string): Promise<ApiResult<ChallengeList>> {
  return get(`/api/challenges/list?token=${token}`);
}

export async function searchUsernames(query: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.usernames) ? data.usernames : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/challenge-api.ts
git commit -m "Add Challenge Mode client API wrapper"
```

---

### Task 17: Extract the settings picker from `SetupScreen`

**Files:**
- Create: `apps/web/src/components/GameSettingsPicker.tsx`
- Modify: `apps/web/src/components/SetupScreen.tsx`

**Interfaces:**
- Produces: `<GameSettingsPicker mode difficulty includedLeagues excludedCountries onModeChange onDifficultyChange onToggleLeague onToggleCountry onSelectAllLeagues onClearAllLeagues dataset locale />` — a pure presentational component with the exact same JSX/behavior as `SetupScreen`'s current mode/difficulty/leagues/countries block (native branch, lines 173–247 as read this session), just with props instead of local state. Consumed by both `SetupScreen` (Task 18) and the new challenge-creation flow (Task 22).

- [ ] **Step 1: Write `GameSettingsPicker.tsx`**

This is a mechanical extraction — same JSX, same class names, same conditional logic as the current `SetupScreen` block, wired to props instead of `useState`:

```tsx
import { Pressable, Text, View } from "react-native";
import type { Country, Dataset, Difficulty, GameMode, League } from "@321guess/core";
import { localeUpper } from "../lib/locale-upper";
import { ArenaChip } from "./ArenaChip";
import { ArenaPressable } from "./ArenaPressable";
import { useTranslations } from "use-intl";

export function GameSettingsPicker({
  mode,
  difficulty,
  includedLeagues,
  excludedCountries,
  onModeChange,
  onDifficultyChange,
  onToggleLeague,
  onToggleCountry,
  onSelectAllLeagues,
  onClearAllLeagues,
  dataset,
  clubCountries,
  countriesReady,
  locale,
}: {
  mode: GameMode;
  difficulty: Difficulty;
  includedLeagues: Set<string>;
  excludedCountries: Set<string>;
  onModeChange: (mode: GameMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onToggleLeague: (id: string) => void;
  onToggleCountry: (code: string) => void;
  onSelectAllLeagues: () => void;
  onClearAllLeagues: () => void;
  dataset: Dataset;
  clubCountries: Country[];
  countriesReady: boolean;
  locale: string;
}) {
  const t = useTranslations("setup");
  const tMode = (key: string) => t(`mode.${key}` as never);

  return (
    <View className="gap-10">
      <View>
        <Text className="mb-4 text-lg font-semibold tracking-wider text-arena-text-soft">
          {localeUpper(t("difficulty.heading"), locale)}
        </Text>
        <View className="flex-row gap-3">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <ArenaPressable
              key={d}
              onPress={() => onDifficultyChange(d)}
              className={`flex-1 items-center rounded-xl border-2 px-3 py-5 ${
                difficulty === d
                  ? "border-arena-accent-2 bg-arena-accent-2/15"
                  : "border-arena-bg-soft bg-arena-bg-soft"
              }`}
            >
              <Text className="text-lg font-semibold text-arena-text">{t(`difficulty.${d}.title`)}</Text>
              <Text className="mt-1 text-center text-sm text-arena-text-soft">{t(`difficulty.${d}.description`)}</Text>
            </ArenaPressable>
          ))}
        </View>
      </View>

      <View>
        <View className="flex-row gap-3">
          {(["clubClub", "countryClub"] as const).map((m) => (
            <ArenaPressable
              key={m}
              onPress={() => onModeChange(m)}
              className={`flex-1 items-center rounded-2xl border-[3px] p-4 ${
                mode === m ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
              }`}
            >
              <Text className="text-lg font-bold text-arena-text">{tMode(`${m}.title`)}</Text>
              <Text className="mt-1 text-center text-sm text-arena-text-soft">{tMode(`${m}.description`)}</Text>
            </ArenaPressable>
          ))}
        </View>
      </View>

      <View>
        <View className="mb-4 flex-row items-baseline justify-between">
          <Text className="text-lg font-semibold tracking-wider text-arena-text-soft">
            {localeUpper(t("leagues.heading"), locale)}
          </Text>
          <View className="flex-row gap-3">
            <Pressable onPress={onSelectAllLeagues}>
              <Text className="text-base text-arena-accent-2">{t("leagues.selectAll")}</Text>
            </Pressable>
            <Pressable onPress={onClearAllLeagues}>
              <Text className="text-base text-arena-text-soft">{t("leagues.clearAll")}</Text>
            </Pressable>
          </View>
        </View>
        <Text className="mb-4 text-base text-arena-text-soft">{t("leagues.hint")}</Text>
        <View className="gap-3">
          {dataset.leagues.map((l: League) => (
            <ArenaChip
              key={l.id}
              checked={includedLeagues.has(l.id)}
              onPress={() => onToggleLeague(l.id)}
              label={locale === "tr" ? l.nameTr : l.nameEn}
            />
          ))}
        </View>
      </View>

      {mode === "countryClub" && (
        <View>
          <Text className="mb-4 text-lg font-semibold tracking-wider text-arena-text-soft">
            {localeUpper(t("excludedCountries.heading"), locale)}
          </Text>
          <Text className="mb-4 text-base text-arena-text-soft">{t("excludedCountries.hint")}</Text>
          {countriesReady ? (
            <View className="gap-3">
              {clubCountries.map((c) => (
                <ArenaChip
                  key={c.code}
                  checked={!excludedCountries.has(c.code)}
                  onPress={() => onToggleCountry(c.code)}
                  label={locale === "tr" ? c.nameTr : c.nameEn}
                />
              ))}
            </View>
          ) : (
            <View className="items-center py-6">
              <Text className="text-arena-text-soft">…</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Extract `ArenaChip` out of `SetupScreen.tsx` into its own file**

`SetupScreen.tsx` currently defines `function ArenaChip(...)` inline (below the main component) — `GameSettingsPicker.tsx` needs it too, and a shared component shouldn't live inside one specific screen's file. Move it as-is to a new file:

```tsx
// apps/web/src/components/ArenaChip.tsx
import { Pressable, Text } from "react-native";
import { useGameSettings } from "../lib/game-settings-context";
import { hapticTap } from "../lib/haptics";

// Plain Pressable, not ArenaPressable: this renders inside potentially long
// lists (the country list alone is 169 items), and ArenaPressable's
// per-item Animated.Value + haptic/sound overhead was expensive enough,
// multiplied across that many chips mounting at once, to cause a visible
// stall when switching into Country×Club mode. Keeps a plain haptic tap —
// cheap even at this scale — just drops the spring animation and sound.
export function ArenaChip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const { hapticsEnabled } = useGameSettings();
  return (
    <Pressable
      onPress={() => {
        void hapticTap(hapticsEnabled);
        onPress();
      }}
      className={`flex-row items-center gap-3 rounded-lg border-2 px-4 py-4 ${
        checked ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className={`text-lg ${checked ? "text-arena-accent-2" : "text-arena-text-soft"}`}>
        {checked ? "☑" : "☐"}
      </Text>
      <Text className={`text-lg ${checked ? "text-arena-text" : "text-arena-text-soft"}`}>{label}</Text>
    </Pressable>
  );
}
```

Delete the inline `function ArenaChip(...)` definition from the bottom of `apps/web/src/components/SetupScreen.tsx` and add `import { ArenaChip } from "./ArenaChip";` to its imports (it's still used directly in `SetupScreen.tsx` for now — Task 18 replaces those call sites with `GameSettingsPicker`).

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors (SetupScreen.tsx isn't restructured yet — this task only extracts, Task 18 rewires it)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/GameSettingsPicker.tsx apps/web/src/components/ArenaChip.tsx apps/web/src/components/SetupScreen.tsx
git commit -m "Extract GameSettingsPicker and ArenaChip out of SetupScreen for reuse"
```

---

### Task 18: Restructure `SetupScreen`'s native mode list into 3 top-level boxes

**Files:**
- Modify: `apps/web/src/components/SetupScreen.tsx`
- Modify: `apps/web/src/locales/tr.json`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `GameSettingsPicker` (Task 17).
- Produces: the native branch's mode section becomes 3 boxes (Günlük Meydan Okuma / Arkadaşına Meydan Oku / Tek Cihazdan Oyna) with a `screen` state (`"modes" | "offline-settings"`) — tapping "Tek Cihazdan Oyna" reveals the existing `GameSettingsPicker` + Start button (previously always visible); tapping "Günlük Meydan Okuma" or "Arkadaşına Meydan Oku" navigates as before/to the new `/challenge` route (Task 21).

- [ ] **Step 1: Add the new i18n keys**

Add to `apps/web/src/locales/tr.json`, inside the existing `"setup"` namespace object:

```json
"modeGroups": {
  "daily": { "title": "Günlük Meydan Okuma", "subtitle": "Dünyayla yarış" },
  "challenge": { "title": "Arkadaşına Meydan Oku", "subtitle": "Davet et, skorunu geç" },
  "offline": { "title": "Tek Cihazdan Oyna", "subtitle": "Arkadaşınla aynı ekranda" }
}
```

Add the mirrored English version to `apps/web/src/locales/en.json`:

```json
"modeGroups": {
  "daily": { "title": "Daily Challenge", "subtitle": "Race the world" },
  "challenge": { "title": "Challenge a Friend", "subtitle": "Invite them, beat your score" },
  "offline": { "title": "Play on One Device", "subtitle": "Same screen as your friend" }
}
```

- [ ] **Step 2: Replace the native branch's mode section**

In `apps/web/src/components/SetupScreen.tsx`, add a new state near the other `useState` calls:

```tsx
const [screen, setScreen] = useState<"modes" | "offline-settings">("modes");
```

Replace the entire block from `<View>` at (the mode-heading `Text` + mode-cards `View`, i.e. what's currently lines ~126–171) through the closing of that outer `<View>` with:

```tsx
{screen === "modes" ? (
  <View className="gap-4">
    <ArenaPressable
      onPress={() => router.push("/online")}
      className="flex-row items-center gap-4 rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent p-5"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/25">
        <Text className="text-3xl">🏆</Text>
      </View>
      <View className="flex-1">
        <Text className="text-lg font-black text-[#2A1E00]">{t("modeGroups.daily.title")}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-[#5C4300]">{t("modeGroups.daily.subtitle")}</Text>
      </View>
      <Text className="rounded-full bg-[#2A1E00]/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-[#2A1E00]">
        ● {localeUpper(tOnline("modeCard.live"), locale)}
      </Text>
    </ArenaPressable>

    <ArenaPressable
      onPress={() => router.push("/challenge")}
      className="flex-row items-center gap-4 rounded-2xl border-b-[6px] border-arena-accent-2-strong bg-arena-accent-2 p-5"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
        <Text className="text-3xl">⚔️</Text>
      </View>
      <View className="flex-1">
        <Text className="text-lg font-black text-[#04231A]">{t("modeGroups.challenge.title")}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-[#04231A]/75">{t("modeGroups.challenge.subtitle")}</Text>
      </View>
      <Text className="text-xl font-black text-[#04231A]/60">›</Text>
    </ArenaPressable>

    <ArenaPressable
      onPress={() => setScreen("offline-settings")}
      className="flex-row items-center gap-4 rounded-2xl border-2 border-b-[6px] border-arena-accent-2/30 bg-arena-bg-soft p-5"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl border border-arena-accent-2/30 bg-arena-bg">
        <Text className="text-2xl">📱</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-arena-text">{t("modeGroups.offline.title")}</Text>
        <Text className="mt-0.5 text-sm text-arena-text-soft">{t("modeGroups.offline.subtitle")}</Text>
      </View>
      <Text className="text-xl font-black text-arena-text-soft">›</Text>
    </ArenaPressable>
  </View>
) : (
  <View className="gap-6">
    <Pressable onPress={() => setScreen("modes")}>
      <Text className="text-sm tracking-wider text-arena-text-soft">← {localeUpper(t("modeGroups.offline.title"), locale)}</Text>
    </Pressable>
    <View className="gap-4">
      <ArenaPressable
        onPress={() => setMode("clubClub")}
        className={`flex-row items-center gap-4 rounded-2xl border-[3px] p-6 ${
          mode === "clubClub" ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
        }`}
      >
        <Text className="text-4xl">🛡️</Text>
        <View className="flex-1">
          <Text className="text-lg font-bold text-arena-text">{t("mode.clubClub.title")}</Text>
          <Text className="mt-1 text-base text-arena-text-soft">{t("mode.clubClub.description")}</Text>
        </View>
      </ArenaPressable>
      <ArenaPressable
        onPress={() => setMode("countryClub")}
        className={`flex-row items-center gap-4 rounded-2xl border-[3px] p-6 ${
          mode === "countryClub" ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
        }`}
      >
        <Text className="text-4xl">🚩</Text>
        <View className="flex-1">
          <Text className="text-lg font-bold text-arena-text">{t("mode.countryClub.title")}</Text>
          <Text className="mt-1 text-base text-arena-text-soft">{t("mode.countryClub.description")}</Text>
        </View>
      </ArenaPressable>
      <ArenaPressable
        onPress={() => router.push("/manual")}
        className="flex-row items-center gap-4 rounded-2xl border-[3px] border-dashed border-arena-bg-soft p-6"
      >
        <Text className="text-4xl">🔍</Text>
        <View className="flex-1">
          <Text className="text-lg font-bold text-arena-text">{tManual("title")}</Text>
          <Text className="mt-1 text-base text-arena-text-soft">{tManual("description")}</Text>
        </View>
      </ArenaPressable>
    </View>
  </View>
)}
```

Note this removes the old inline `ArenaModeCard` usages for club/country mode — they're now plain `ArenaPressable` blocks matching the pattern above (the old `ArenaModeCard` helper function at the bottom of the file becomes unused; delete its definition too).

- [ ] **Step 3: Gate the difficulty/leagues/countries sections (the rest of the `ScrollView`) and the Start footer to `screen === "offline-settings"`**

The blocks after the mode section (difficulty heading, leagues heading, excluded-countries block — currently always rendered) and the sticky Start footer at the bottom must only show in `"offline-settings"`. Wrap each in `{screen === "offline-settings" && (...)}`, and replace their contents with a single `<GameSettingsPicker>` call using the existing local state:

```tsx
{screen === "offline-settings" && (
  <GameSettingsPicker
    mode={mode}
    difficulty={difficulty}
    includedLeagues={includedLeagues}
    excludedCountries={excludedCountries}
    onModeChange={setMode}
    onDifficultyChange={setDifficulty}
    onToggleLeague={toggleLeague}
    onToggleCountry={toggleCountry}
    onSelectAllLeagues={selectAllLeagues}
    onClearAllLeagues={clearAllLeagues}
    dataset={dataset}
    clubCountries={clubCountries}
    countriesReady={countriesReady}
    locale={locale}
  />
)}
```

This replaces both the old inline difficulty section AND the old inline leagues/countries sections (they're now inside `GameSettingsPicker`) — remove the old duplicated JSX for those three sections entirely, since `GameSettingsPicker` already includes the mode toggle too (the "modes" screen no longer needs its own `mode` state changes there, but the `"offline-settings"` screen's `GameSettingsPicker` does include a clubClub/countryClub toggle — this is intentional: within "Tek Cihazdan Oyna", switching between Kulüp×Kulüp and Ülke×Kulüp is still exactly today's behavior, just reached one tap deeper).

For the sticky Start footer, wrap it the same way:

```tsx
{screen === "offline-settings" && (
  <View className="border-t border-arena-bg-soft px-4 pb-6 pt-4">
    <ArenaPressable
      onPress={start}
      disabled={!canStart}
      className={`items-center rounded-2xl border-b-[6px] py-6 ${
        canStart ? "border-arena-accent-strong bg-arena-accent" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className={`text-2xl font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
        {canStart ? t("start") : t("startDisabled")}
      </Text>
    </ArenaPressable>
  </View>
)}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 5: Manual smoke test**

Run `cd apps/web && npx expo start` (or reuse a running dev server), open on a native simulator/device (this screen is native-only — web is unaffected and untouched by this task). Confirm: 3 top-level boxes render; tapping "Günlük Meydan Okuma" still navigates to `/online` unchanged; tapping "Tek Cihazdan Oyna" reveals the settings picker + Start button, and starting a round still works exactly as before (Kulüp×Kulüp and Ülke×Kulüp both playable, leagues/countries toggles work); "Arkadaşına Meydan Oku" 404s for now (its route doesn't exist until Task 21 — expected at this point in the plan).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SetupScreen.tsx apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Restructure Setup screen into 3 top-level modes (Daily / Challenge / Tek Cihazdan Oyna)"
```

---

### Task 19: Extract shared playing-phase UI from `OnlineScreen`

**Files:**
- Create: `apps/web/src/components/RoundPlayView.tsx`
- Modify: `apps/web/src/components/OnlineScreen.tsx`

**Interfaces:**
- Produces: `<RoundPlayView question foundPlayers wrongPlayers overallFoundCount totalPossible dataset onGuess guessFeedback />` — the native-branch JSX currently inside `OnlineScreen`'s `phase === "playing"` block (question card, `GuessInput`, feedback chip, found/wrong chip lists), parameterized so it has no knowledge of Daily Challenge specifically (no timer — Challenge Mode has no time limit, matching the spec's "async, no live state" design; `OnlineScreen` keeps its own timer UI wrapped around this component). `GuessInput` (currently a private function inside `OnlineScreen.tsx`) moves into this new file and is exported, since the new challenge-play screen (Task 22) needs it too.
- Consumes (by `OnlineScreen`, unchanged behavior): nothing new — this task is a pure refactor.

- [ ] **Step 1: Write `RoundPlayView.tsx`**

Move `GuessInput` (both its native and web branches, exactly as they exist today in `OnlineScreen.tsx`) into this new file, exported. Then add `RoundPlayView`, built from `OnlineScreen`'s current `phase === "playing"` native-branch JSX (the `<View className="rounded-2xl bg-arena-bg-soft ...">` question card, minus the timer `<Text>` above it — Challenge Mode has no countdown), the `GuessInput` call, the guess-feedback chip, and the found/wrong chip row:

```tsx
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Player } from "@321guess/core";
import { LogoTile } from "./LogoTile";
import { CelebrationPulse } from "./CelebrationPulse";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function GuessInput({
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
  const isNative = Platform.OS !== "web";

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

  if (isNative) {
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
          placeholderTextColor="#8FE8C4"
          className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text"
        />
        {open && query.trim().length >= 2 && (
          <View className="absolute top-[70px] z-20 max-h-72 w-full rounded-2xl border border-arena-accent-2 bg-arena-bg-soft">
            {filtered.length === 0 ? (
              <Text className="px-4 py-3 text-base text-arena-text-soft">{emptyText}</Text>
            ) : (
              <ScrollView>
                {filtered.map((p) => (
                  <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-3">
                    <Text className="text-lg text-arena-text">{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View className={`relative ${open && query.trim().length >= 2 ? "z-30" : ""}`}>
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
                  <Text className="text-sm text-ink">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

export type PlayQuestion = {
  clubA: { id: string; name: string; logoUrl: string; color?: string };
  clubB: { id: string; name: string; logoUrl: string; color?: string };
  totalPossible: number;
};

/** Shared "answer this club×club or country×club question" UI — question
 * card, guess autocomplete, correct/wrong feedback, found/wrong chip list.
 * Used by both OnlineScreen (Daily Challenge, which wraps this with its
 * own countdown timer above it) and the new Challenge Mode play screen
 * (no timer — challenges are untimed/async). Native-only, matching both
 * callers' existing scope (this is never rendered on web). */
export function RoundPlayView({
  question,
  foundPlayers,
  wrongPlayers,
  players,
  celebrationTick,
  guessFeedback,
  onGuess,
  vsLabel,
  possibleCountLabel,
  guessPlaceholder,
  guessEmptyText,
}: {
  question: PlayQuestion;
  foundPlayers: Player[];
  wrongPlayers: Player[];
  players: Player[];
  celebrationTick: number;
  guessFeedback: { id: number; status: "correct" | "wrong"; label: string } | null;
  onGuess: (player: Player) => void;
  vsLabel: string;
  possibleCountLabel: string;
  guessPlaceholder: string;
  guessEmptyText: string;
}) {
  return (
    <View className="gap-4">
      <View className="rounded-2xl bg-arena-bg-soft px-4 pb-5 pt-5">
        <CelebrationPulse trigger={celebrationTick}>
          <View className="flex-row items-center justify-center gap-4">
            <LogoTile size="sm" src={question.clubA.logoUrl} alt={question.clubA.name} caption={question.clubA.name} color={question.clubA.color} />
            <Text className="text-sm font-black text-arena-text-soft">{vsLabel}</Text>
            <LogoTile size="sm" src={question.clubB.logoUrl} alt={question.clubB.name} caption={question.clubB.name} color={question.clubB.color} />
          </View>
        </CelebrationPulse>

        <View className="mt-4 items-center gap-2">
          <Text className="text-xs text-arena-text-soft">{possibleCountLabel}</Text>
          <View className="flex-row gap-2">
            {Array.from({ length: question.totalPossible }).map((_, i) => (
              <View
                key={i}
                className={`h-3 w-3 rounded-full border border-arena-accent-2 ${i < foundPlayers.length ? "bg-arena-accent-2" : ""}`}
              />
            ))}
          </View>
        </View>
      </View>

      <GuessInput
        players={players}
        excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
        onGuess={onGuess}
        placeholder={guessPlaceholder}
        emptyText={guessEmptyText}
      />

      {guessFeedback && (
        <View
          className={`flex-row items-center gap-2 rounded-lg px-4 py-2.5 ${
            guessFeedback.status === "correct" ? "bg-arena-accent-2/20" : "bg-red-500/15"
          }`}
        >
          <Text className={`text-base ${guessFeedback.status === "correct" ? "text-arena-accent-2" : "text-red-300"}`}>
            {guessFeedback.status === "correct" ? "✓" : "✗"} {guessFeedback.label}
          </Text>
        </View>
      )}

      {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
        <View className="flex-row flex-wrap gap-2">
          {foundPlayers.map((p) => (
            <View key={p.id} className="rounded-full bg-arena-accent-2/20 px-4 py-2">
              <Text className="text-sm font-medium text-arena-text">{p.name}</Text>
            </View>
          ))}
          {wrongPlayers.map((p) => (
            <View key={p.id} className="rounded-full bg-red-500/15 px-4 py-2">
              <Text className="text-sm font-medium text-red-300">✕ {p.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Rewire `OnlineScreen.tsx`'s native `phase === "playing"` block to use `RoundPlayView`**

Replace the native branch's `phase === "playing" && currentQuestion` JSX (the question card + `GuessInput` + feedback + chips block — keep the timer `Text` and the outer question-progress/found-count row, and the "Sonraki Soru"/"Erken Bitir" buttons below it, exactly as they are) with:

```tsx
) : phase === "playing" && currentQuestion ? (
  <View className="gap-4">
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-arena-text-soft">
        {t("questionProgress", { current: questionIndex + 1, total: round.questions.length })}
      </Text>
      <Text className="text-sm text-arena-text-soft">
        {t("foundCount", { found: overallFoundCount, total: round.totalPossible })}
      </Text>
    </View>

    <Text className="self-end rounded-full bg-arena-accent/20 px-4 py-1.5 text-base font-bold text-arena-accent">
      {formatTime(timeLeftMs)}
    </Text>

    <RoundPlayView
      question={currentQuestion}
      foundPlayers={foundPlayers}
      wrongPlayers={wrongPlayers}
      players={dataset.players}
      celebrationTick={celebrationTick}
      guessFeedback={guessFeedback}
      onGuess={submitGuess}
      vsLabel={t("vs")}
      possibleCountLabel={t("possibleCount", { count: currentQuestion.totalPossible })}
      guessPlaceholder={t("guessPlaceholder")}
      guessEmptyText={t("guessEmpty")}
    />

    <ArenaPressable
      onPress={() => void goToNextQuestion()}
      className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
    >
      <Text className="text-lg font-bold text-[#2A1E00]">
        {foundPlayers.length > 0 ? t("nextQuestion") : t("pass")}
      </Text>
    </ArenaPressable>
    <ArenaPressable onPress={() => void finish()} className="items-center rounded-2xl border border-arena-accent-2 py-4">
      <Text className="text-base font-semibold text-arena-text-soft">{t("finishEarly")}</Text>
    </ArenaPressable>
  </View>
```

Remove the now-unused private `GuessInput` function definition from the bottom of `OnlineScreen.tsx` (it moved to `RoundPlayView.tsx`) and add `import { RoundPlayView } from "./RoundPlayView";` to its imports. **Do not touch the web branch** — `RoundPlayView` is native-only by construction (it has no `Platform.OS` check because it's only ever called from native branches), so `OnlineScreen`'s web JSX keeps its own separate, untouched `GuessInput`-equivalent code path exactly as it is today (the web branch already has its own inline `GuessInput` reference — since `GuessInput` moved to a new file but is still exported and still handles both platforms internally via its own `Platform.OS` check, the web branch's existing `<GuessInput .../>` call keeps working unchanged, just via the new import path).

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 4: Manual regression test — Daily Challenge must be pixel-identical**

Run the app on native, play a full Daily Challenge round end to end (register if needed, answer questions correct and wrong, use "Sonraki Soru"/"Erken Bitir", finish). Confirm the playing-phase screen looks and behaves exactly as it did before this task — this is a pure refactor, zero visual or functional change expected on Daily Challenge.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RoundPlayView.tsx apps/web/src/components/OnlineScreen.tsx
git commit -m "Extract RoundPlayView (shared question/guess UI) out of OnlineScreen"
```

---

### Task 20: Client-side challenge progress storage

**Files:**
- Create: `apps/web/src/lib/challenge-storage.ts`

**Interfaces:**
- Produces: `type ChallengeProgress = { finished: false; questionIndex: number; foundPlayerIds: string[]; wrongPlayerIds: string[]; overallFoundCount: number } | { finished: true }`, `loadChallengeProgress(challengeId: string): Promise<ChallengeProgress | null>`, `saveChallengeProgress(challengeId: string, progress: ChallengeProgress): Promise<void>`, `clearChallengeProgress(challengeId: string): Promise<void>`.

- [ ] **Step 1: Write the storage module**

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY_PREFIX = "321guess.challenge.progress.";

export type ChallengeProgress =
  | { finished: true }
  | {
      finished: false;
      questionIndex: number;
      foundPlayerIds: string[];
      wrongPlayerIds: string[];
      overallFoundCount: number;
    };

function progressKey(challengeId: string) {
  return `${PROGRESS_KEY_PREFIX}${challengeId}`;
}

/** Mirrors apps/web/src/lib/online-storage.ts's loadProgress/saveProgress
 * shape, keyed by challengeId instead of roundDate — Challenge Mode reuses
 * the SAME identity storage (loadIdentity/saveIdentity in
 * online-storage.ts), this file only tracks in-progress answers so
 * closing the app mid-challenge doesn't lose them. */
export async function loadChallengeProgress(challengeId: string): Promise<ChallengeProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey(challengeId));
    return raw ? (JSON.parse(raw) as ChallengeProgress) : null;
  } catch {
    return null;
  }
}

export async function saveChallengeProgress(challengeId: string, progress: ChallengeProgress): Promise<void> {
  await AsyncStorage.setItem(progressKey(challengeId), JSON.stringify(progress));
}

export async function clearChallengeProgress(challengeId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(progressKey(challengeId));
  } catch {}
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/challenge-storage.ts
git commit -m "Add client-side challenge progress storage"
```

---

### Task 21: `ChallengeScreen` — hub phase

**Files:**
- Create: `apps/web/src/app/challenge.tsx`
- Create: `apps/web/src/components/ChallengeScreen.tsx`
- Modify: `apps/web/src/locales/tr.json`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `loadIdentity` from `../lib/online-storage`; `listChallenges` from `../lib/challenge-api`.
- Produces: the `/challenge` route, native-only (redirects to `/` on web, exactly like `apps/web/src/app/settings.tsx`'s existing pattern). This task only builds the **hub** phase (`screen === "hub"`); Tasks 22–23 add the other phases to the same component/file.

- [ ] **Step 1: Add the i18n namespace**

Add to `apps/web/src/locales/tr.json` (new top-level `"challenge"` key, sibling to `"setup"`/`"online"`):

```json
"challenge": {
  "back": "Ana ekran",
  "title": "Arkadaşına Meydan Oku",
  "loading": "Yükleniyor…",
  "newChallenge": "+ Yeni Meydan Okuma",
  "randomOpponent": "Rastgele Rakip",
  "incomingHeading": "Gelen Davetler",
  "outgoingHeading": "Bekleyenler",
  "rivalriesHeading": "Rekabet Geçmişi",
  "emptyIncoming": "Bekleyen davetin yok.",
  "emptyOutgoing": "Cevap bekleyen meydan okuman yok.",
  "emptyRivalries": "Henüz bir meydan okuma tamamlamadın.",
  "waitingForOpponent": "Rakip bekleniyor",
  "playNow": "Şimdi Oyna",
  "rivalryScore": "{wins}-{losses}"
}
```

Add the mirrored English version to `en.json`:

```json
"challenge": {
  "back": "Home",
  "title": "Challenge a Friend",
  "loading": "Loading…",
  "newChallenge": "+ New Challenge",
  "randomOpponent": "Random Opponent",
  "incomingHeading": "Incoming",
  "outgoingHeading": "Waiting",
  "rivalriesHeading": "Head-to-Head History",
  "emptyIncoming": "No pending invites.",
  "emptyOutgoing": "No challenges waiting on a reply.",
  "emptyRivalries": "You haven't finished a challenge yet.",
  "waitingForOpponent": "Waiting for opponent",
  "playNow": "Play Now",
  "rivalryScore": "{wins}-{losses}"
}
```

- [ ] **Step 2: Create the route file**

```tsx
// apps/web/src/app/challenge.tsx
import { Platform } from "react-native";
import { Redirect } from "expo-router";
import { ChallengeScreen } from "@/components/ChallengeScreen";

export default function Challenge() {
  if (Platform.OS === "web") return <Redirect href="/" />;
  return <ChallengeScreen />;
}
```

- [ ] **Step 3: Write `ChallengeScreen.tsx`'s hub phase**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { listChallenges, type ChallengeList } from "../lib/challenge-api";
import { loadIdentity, type Identity } from "../lib/online-storage";
import { ArenaPressable } from "./ArenaPressable";

type Screen = { kind: "hub" };
// Tasks 22-23 extend this union with the creation-flow and play/result
// phases and replace the `screen` state's type accordingly.

export function ChallengeScreen() {
  const t = useTranslations("challenge");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [list, setList] = useState<ChallengeList | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "hub" });

  useEffect(() => {
    loadIdentity().then(setIdentity);
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
              onPress={() => setScreen({ kind: "hub" } /* Task 22 replaces with the creation-flow entry */)}
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
                    {t("rivalryScore", { wins: c.rivalry.playerAWins, losses: c.rivalry.playerBWins })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

On a native simulator/device, tap "Arkadaşına Meydan Oku" from the Setup screen (now wired since Task 18). Confirm the hub renders, shows the empty states for a fresh player, and "← Ana ekran" navigates back.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/challenge.tsx apps/web/src/components/ChallengeScreen.tsx apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Add Challenge Mode hub screen"
```

---

### Task 22: `ChallengeScreen` — creation flow (settings → play → send)

**Files:**
- Modify: `apps/web/src/components/ChallengeScreen.tsx`
- Modify: `apps/web/src/locales/tr.json`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `GameSettingsPicker` (Task 17), `RoundPlayView`/`GuessInput` (Task 19), `createChallenge`/`sendChallenge`/`submitChallengeGuess`/`finishChallenge`/`searchUsernames` (Task 16), `loadDataset` (existing, from `../lib/dataset`).
- Produces: extends `ChallengeScreen`'s `Screen` union with `{ kind: "new-settings" } | { kind: "new-playing"; challenge: ChallengeRow } | { kind: "new-send"; challenge: ChallengeRow; result: FinishChallengeResult }`, wires the hub's "+ Yeni Meydan Okuma" button to `{ kind: "new-settings" }`.

- [ ] **Step 1: Add i18n keys**

Add to `apps/web/src/locales/tr.json`'s `"challenge"` namespace:

```json
"newSettingsHeading": "Ayarları Seç",
"startPlaying": "Oyna",
"sendHeading": "Sonucun Belirlendi!",
"sendScoreLabel": "{correct} / {total} doğru",
"searchPlaceholder": "Kullanıcı adı ara…",
"searchEmpty": "Kullanıcı bulunamadı",
"sendToUser": "Bu Kullanıcıya Gönder",
"orGenerateLink": "ya da",
"generateLink": "Link Oluştur ve Paylaş",
"linkCopied": "Link kopyalandı!",
"sentSuccess": "Meydan okuma gönderildi!"
```

Mirror to `en.json`:

```json
"newSettingsHeading": "Choose Settings",
"startPlaying": "Play",
"sendHeading": "Your Score Is In!",
"sendScoreLabel": "{correct} / {total} correct",
"searchPlaceholder": "Search username…",
"searchEmpty": "No user found",
"sendToUser": "Send to This User",
"orGenerateLink": "or",
"generateLink": "Generate a Link to Share",
"linkCopied": "Link copied!",
"sentSuccess": "Challenge sent!"
```

- [ ] **Step 2: Extend the `Screen` union and hub wiring**

```tsx
type Screen =
  | { kind: "hub" }
  | { kind: "new-settings" }
  | { kind: "new-playing"; challenge: ChallengeRow }
  | { kind: "new-send"; challenge: ChallengeRow; result: FinishChallengeResult };
```

Update the hub's "+ Yeni Meydan Okuma" button:

```tsx
<ArenaPressable
  onPress={() => setScreen({ kind: "new-settings" })}
  className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
>
```

- [ ] **Step 3: Add the settings-picking phase**

Add state near the top of `ChallengeScreen` (alongside `identity`/`list`):

```tsx
const [dataset, setDataset] = useState<Dataset | null>(null);
const [mode, setMode] = useState<GameMode>("clubClub");
const [difficulty, setDifficulty] = useState<Difficulty>("medium");
const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());
const locale = useLocale();

useEffect(() => {
  loadDataset().then((d) => {
    setDataset(d);
    setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
  });
}, []);

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
```

Add imports: `useLocale` from `use-intl`; `useMemo` from `react` (extend the existing `useState, useEffect, useCallback` import); `Dataset, Difficulty, GameMode` from `@321guess/core`; `loadDataset` from `../lib/dataset`; `createChallenge, type ChallengeRow, type FinishChallengeResult` from `../lib/challenge-api`; `GameSettingsPicker` from `./GameSettingsPicker`.

Add the render branch:

```tsx
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
```

- [ ] **Step 4: Add the playing phase (creator plays their own challenge)**

Add state for tracking play progress (mirrors `OnlineScreen`'s equivalent local state, minus the timer):

```tsx
const [questionIndex, setQuestionIndex] = useState(0);
const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
const [wrongPlayers, setWrongPlayers] = useState<Player[]>([]);
const [overallFoundCount, setOverallFoundCount] = useState(0);
const [celebrationTick, setCelebrationTick] = useState(0);
const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);
const feedbackIdRef = useRef(0);

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
```

Add imports: `useRef` (extend the React import); `Player` type from `@321guess/core`; `submitChallengeGuess, finishChallenge` from `../lib/challenge-api`; `RoundPlayView` from `./RoundPlayView`.

Add the render branch:

```tsx
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
          vsLabel={t("vs" as never)}
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
```

`currentQuestion.totalPossible` (Task 16's `ChallengeQuestion` shape) is exactly what's needed here — the server never sends the raw answer key to a client for a question that hasn't been answered yet (same principle as Daily Challenge's `RoundInfo`); scoring happens entirely server-side in the guess/finish routes via `getChallengeQuestionAnswers` (Task 5).

- [ ] **Step 5: Add the send phase**

Add state:

```tsx
const [searchQuery, setSearchQuery] = useState("");
const [searchResults, setSearchResults] = useState<string[]>([]);
const [sendStatus, setSendStatus] = useState<"idle" | "sent" | "link">("idle");
const [shareUrl, setShareUrl] = useState<string | null>(null);
```

Add a search-debounce effect and handlers:

```tsx
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
```

Add imports: `sendChallenge, searchUsernames` from `../lib/challenge-api`; `Share` from `react-native` (for the native share sheet, or reuse `apps/web/src/lib/share.ts`'s existing `shareOrCopy` — use that, it already exists and handles the platform difference).

Add the render branch:

```tsx
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
```

Add `TextInput` to the `react-native` import, and `shareOrCopy` from `../lib/share`.

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 7: Manual smoke test**

Full flow on a native simulator/device with two registered test usernames: from the hub, "+ Yeni Meydan Okuma" → pick settings → play all 5 questions → land on the send screen with your score shown → search the second test username → send → confirm `sentSuccess` shows. Separately, use `apps/api/scripts/delete-online-player.ts` to clean up test accounts afterward (existing script, unchanged).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ChallengeScreen.tsx apps/web/src/lib/challenge-api.ts apps/api/lib/challenge-db.ts apps/api/app/api/challenges/\[id\]/guess/route.ts apps/api/app/api/challenges/\[id\]/finish/route.ts apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Add Challenge Mode creation flow (settings, play, send)"
```

---

### Task 23: `ChallengeScreen` — random opponent, opponent play (link/invite), and result phase

**Files:**
- Modify: `apps/web/src/components/ChallengeScreen.tsx`
- Modify: `apps/web/src/locales/tr.json`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `matchRandomChallenge`, `fetchChallenge` from `../lib/challenge-api` (Task 16).
- Produces: extends `Screen` with `{ kind: "opponent-playing"; challenge: ChallengeRow; role: "creator" | "opponent" } | { kind: "result"; challenge: ChallengeRow; result: FinishChallengeResult }`; wires the hub's "Rastgele Rakip" button and each incoming-challenge row to actually open/play a challenge; adds a **Rovanş** button to the result screen.

- [ ] **Step 1: Add i18n keys**

Add to `tr.json`'s `"challenge"` namespace:

```json
"resultHeading": "Sonuç",
"youScored": "Sen: {correct}/{total}",
"opponentScored": "{username}: {correct}/{total}",
"youWon": "Kazandın!",
"youLost": "Kaybettin",
"tied": "Berabere",
"rematch": "Rovanş",
"backToHub": "Geri Dön"
```

Mirror to `en.json`:

```json
"resultHeading": "Result",
"youScored": "You: {correct}/{total}",
"opponentScored": "{username}: {correct}/{total}",
"youWon": "You won!",
"youLost": "You lost",
"tied": "Tied",
"rematch": "Rematch",
"backToHub": "Back"
```

- [ ] **Step 2: Extend the `Screen` union and wire entry points**

```tsx
type Screen =
  | { kind: "hub" }
  | { kind: "new-settings" }
  | { kind: "new-playing"; challenge: ChallengeRow }
  | { kind: "new-send"; challenge: ChallengeRow; result: FinishChallengeResult }
  | { kind: "opponent-playing"; challenge: ChallengeRow }
  | { kind: "result"; challenge: ChallengeRow; myResult: FinishChallengeResult; opponentUsername: string | null };
```

Wire the hub's "Rastgele Rakip" button:

```tsx
<ArenaPressable
  onPress={() => void startRandomOpponent()}
  className="items-center rounded-2xl border-2 border-arena-accent-2 py-5"
>
  <Text className="text-lg font-bold text-arena-accent-2">{t("randomOpponent")}</Text>
</ArenaPressable>
```

Wire each incoming-challenge row:

```tsx
<ArenaPressable
  key={c.id}
  onPress={() => openIncomingChallenge(c)}
  className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4"
>
```

- [ ] **Step 3: Add the handler functions**

```tsx
async function startRandomOpponent() {
  if (!identity) return;
  const res = await matchRandomChallenge(identity.token);
  if (res.status !== "ok") return;
  setQuestionIndex(0);
  setFoundPlayers([]);
  setWrongPlayers([]);
  if (res.data.role === "opponent") {
    setScreen({ kind: "opponent-playing", challenge: res.data });
  } else {
    setScreen({ kind: "new-playing", challenge: res.data });
  }
}

function openIncomingChallenge(challenge: ChallengeRow) {
  setQuestionIndex(0);
  setFoundPlayers([]);
  setWrongPlayers([]);
  setScreen({ kind: "opponent-playing", challenge });
}

// FinishChallengeResult.opponentResult.username (Task 5/16) is the other
// player's username — no separate lookup needed.
async function finishOpponentPlaying(challenge: ChallengeRow) {
  if (!identity) return;
  const res = await finishChallenge(identity.token, challenge.id);
  if (res.status !== "ok") return;
  setScreen({ kind: "result", challenge, myResult: res.data, opponentUsername: res.data.opponentResult?.username ?? null });
  refreshList();
}
```

- [ ] **Step 4: Add the opponent-playing render branch**

Same shape as Task 22's `new-playing` branch, but calling `finishOpponentPlaying` instead of `finishPlaying` at the end of the last question, and reusing the same `submitPlayGuess`/`goToNextPlayQuestion` handlers parameterized by which finish function to call. Refactor `goToNextPlayQuestion` to accept the finish callback:

```tsx
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
```

Update Task 22's `new-playing` branch's button to `onPress={() => void goToNextPlayQuestion(challenge, finishPlaying)}`.

Add:

```tsx
if (screen.kind === "opponent-playing") {
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
          question={{ clubA: currentQuestion.clubA, clubB: currentQuestion.clubB, totalPossible: currentQuestion.totalPossible }}
          foundPlayers={foundPlayers}
          wrongPlayers={wrongPlayers}
          players={dataset.players}
          celebrationTick={celebrationTick}
          guessFeedback={guessFeedback}
          onGuess={(p) => void submitPlayGuess(challenge, p)}
          vsLabel="×"
          possibleCountLabel=""
          guessPlaceholder={t("searchPlaceholder")}
          guessEmptyText={t("searchEmpty")}
        />
        <ArenaPressable
          onPress={() => void goToNextPlayQuestion(challenge, finishOpponentPlaying)}
          className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-5"
        >
          <Text className="text-lg font-bold text-[#2A1E00]">→</Text>
        </ArenaPressable>
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 5: Add the result render branch (with Rovanş)**

```tsx
async function rematch(challenge: ChallengeRow, opponentUsername: string | null) {
  if (!identity || !opponentUsername) return;
  const res = await createChallenge(identity.token, challenge.mode as GameMode, challenge.difficulty as Difficulty, challenge.includedLeagues);
  if (res.status !== "ok") return;
  setQuestionIndex(0);
  setFoundPlayers([]);
  setWrongPlayers([]);
  setScreen({ kind: "new-playing", challenge: res.data });
  // The send step (Task 22's "new-send" screen) is reached after playing,
  // same as any new challenge — opponentUsername is prefilled by having
  // the user re-search, since /send's search step doesn't currently
  // accept a prefilled default. Acceptable for v1: a rematch still saves
  // the settings-picking step, which is the main friction being removed.
}

if (screen.kind === "result") {
  const { myResult, opponentUsername } = screen;
  const opponentCorrect = myResult.opponentResult?.correctCount ?? 0;
  const opponentTotal = myResult.opponentResult?.totalPossible ?? myResult.totalPossible;
  const outcome =
    myResult.correctCount === opponentCorrect ? "tied" : myResult.correctCount > opponentCorrect ? "won" : "lost";

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-arena-bg px-4">
      <Text className="text-3xl font-black text-arena-text">{t("resultHeading")}</Text>
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
    </View>
  );
}
```

`myResult.opponentResult.username` (from `FinishChallengeResult`, already carrying `username` since Task 5/16) is what feeds `opponentUsername` in `finishOpponentPlaying`/`finishPlaying` above — no further wiring needed here.

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p . && cd ../api && npx tsc --noEmit`
Expected: no errors in either app

- [ ] **Step 7: Full end-to-end manual test**

Using two registered test player identities on two devices/simulators (or two Expo Go sessions signed in as different players via cleared AsyncStorage): Player A creates a targeted challenge, plays it, sends it to Player B by username. Player B sees it under "Gelen Davetler" in the hub, taps it, plays it, sees the result screen with both scores and win/lose/tie, taps "Rovanş" and confirms a new challenge starts. Separately, both players tap "Rastgele Rakip" — confirm the second one to tap gets matched (`role: "opponent"`) against the first (`role: "creator"`) and both see a completed result after the second one finishes. Clean up test accounts afterward with `apps/api/scripts/delete-online-player.ts`.

- [ ] **Step 8: Run the full test suite one more time**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: everything passes — this is the final state of Challenge Mode Core.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/ChallengeScreen.tsx apps/api/lib/challenge-db.ts apps/web/src/lib/challenge-api.ts apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Add random opponent, opponent play, result screen, and rematch"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-08-26-challenge-mode-design.md` except "Account Linking" (deliberately deferred to the sibling plan) is covered — targeted flow (Tasks 8, 11, 12, 16, 22), random flow (Tasks 5, 13, 23), rivalries (Tasks 2, 5, 23), push (Tasks 6, 7, 10, 11), UI hierarchy (Tasks 17–19, 21), data model (Task 1).
- **Gaps found and fixed during self-review:** the spec didn't define a username-search backend for the "arama/otomatik tamamlama" step — added `GET /api/online/search` (Task 14) and `searchPlayers`/`getPlayerTokenByUsername` (Tasks 5, 11). The spec also didn't say whether question answer keys should be exposed to the client before answering — resolved by keeping `ChallengeRow.questions` answer-free (`totalPossible` only, no `answerPlayerIds`) throughout, and adding a server-internal `getChallengeQuestionAnswers` accessor (Task 5) that only the guess/finish routes call, matching how Daily Challenge's `RoundInfo` already withholds answers from the client. The spec also didn't say where the opponent's username surfaces after a challenge completes — `FinishChallengeResult.opponentResult` (Task 5) carries it from the start.
- **Type consistency check:** `ChallengeQuestionRow`/`ChallengeQuestion`/`FinishChallengeResult` are defined once each (Tasks 5 and 16) with the answer-free, username-carrying shapes described above, and every later task (9, 10, 22, 23) consumes those same shapes without re-deriving or correcting them.
