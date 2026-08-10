# Monorepo Foundation (packages/core + apps/api) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the npm-workspaces monorepo skeleton from
[docs/superpowers/specs/2026-08-10-react-native-migration-design.md](../specs/2026-08-10-react-native-migration-design.md):
extract framework-agnostic game logic into `packages/core`, and carve the
existing Supabase-backed API/cron backend into an independently-runnable
`apps/api`. This is Plan A of the migration — see "Sequencing note" below
for what's deliberately deferred to Plan B.

**Architecture:** Root `package.json` becomes an npm-workspaces root
(`apps/*`, `packages/*`). `packages/core` holds pure TypeScript (game
logic, types, profanity filter, a cross-platform dataset loader) with no
Next.js/DOM/Node-fs dependency. `apps/api` is a slimmed Next.js project
(API routes + cron only, no pages) that depends on `@321guess/core` as a
workspace package.

**Tech Stack:** npm workspaces, Next.js 15 (`apps/api`), TypeScript,
Vitest, Supabase JS client, firebase-admin — all already in use today,
no new tooling introduced.

## Global Constraints

- Copy, don't move, in this plan: the existing root `app/`, `components/`,
  `lib/`, `public/data/`, `supabase/`, `vercel.json`, `middleware.ts`,
  `i18n/`, `locales/` stay exactly as they are today, still building and
  running as they do now. Nothing at the repo root is deleted in this
  plan — see "Sequencing note".
- Every file that moves unchanged is copied byte-for-byte (verify with
  `diff` where a step says so) — only files with an explicit before/after
  in a step are edited.
- `packages/core` and `apps/api` must each be runnable/testable on their
  own before the plan is considered done (Task 6).
- No build step for `@321guess/core` — Next.js transpiles it directly via
  `transpilePackages`, matching this project's YAGNI-lean toward avoiding
  new tooling until it's actually needed.

## Sequencing note (why the root app isn't touched or deleted here)

The design doc's end state has `apps/web` (Expo) fully replacing the
current root Next.js website. This plan does **not** build `apps/web` yet
and does **not** delete the root website — doing the deletion here, before
`apps/web` exists to replace it, would leave the repo with no working
frontend at all during active development, for no safety benefit (nothing
in this repo is deployed to production during this migration — confirmed
with the user before any of this work started). Deleting the root
`app/[locale]/*`, `components/`, `lib/`, `mobile/`, and
`components/PushRegistration.tsx`, and trimming the root `package.json`,
is the **first task of the next plan** (`apps/web` scaffold), once there's
something to cut over to. Until then, the repo will carry a temporary,
known duplication (root `lib/game.ts` etc. next to `packages/core/src/`) —
intentional, not an oversight.

## Correction to the design doc

The design doc listed "`lib/daily-round.ts`'s pure question-generation
logic" as moving into `packages/core`. Reading the actual code
(`lib/server-dataset.ts`) shows `pickDailyQuestions()` depends on
`loadServerDataset()`, which uses `node:fs` — that's Node-only and cannot
run in a React Native/Expo app. No client (web or app) ever imports
`lib/daily-round.ts` directly today — `app/api/online/round/route.ts` is
its only consumer. So **all** of `lib/daily-round.ts` moves into
`apps/api` (Task 4), not `packages/core`. `packages/core` only gets the
three files that are genuinely framework-agnostic: `game.ts`, `types.ts`,
`profanity.ts`, plus a new cross-platform dataset loader (Task 2).

---

### Task 1: Workspace scaffold + `packages/core` (types, game, profanity)

**Files:**
- Modify: `/Users/munurcoskun/Claude/321guess/package.json`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/package.json`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/tsconfig.json`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/types.ts`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/game.ts`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/game.test.ts`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/profanity.ts`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/profanity.test.ts`
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/index.ts`

**Interfaces:**
- Produces: `@321guess/core` exporting everything currently exported by
  `lib/types.ts` (`Country`, `League`, `Club`, `Player`, `GameMode`,
  `Difficulty`, `Settings`, `ClubClubRound`, `CountryClubRound`, `Round`,
  `Dataset`), `lib/game.ts` (`Pool`, `buildPool`, `clubsForDifficulty`,
  `pickClubClubRound`, `pickClubClubRoundFromClubs`, `pickCountryClubRound`,
  `pickRound`), and `lib/profanity.ts` (`UsernameValidation`,
  `validateUsername`, `containsBlockedWord`).

- [ ] **Step 1: Add the workspaces field to the root `package.json`**

Edit `/Users/munurcoskun/Claude/321guess/package.json` — add a
`"workspaces"` key right after `"private": true` (keep every existing
field as-is):

```json
{
  "name": "321guess",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
```

- [ ] **Step 2: Create `packages/core/package.json`**

```json
{
  "name": "@321guess/core",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create `packages/core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Copy `types.ts`, `game.ts`, `game.test.ts`, `profanity.ts`, `profanity.test.ts` unchanged**

```bash
cp /Users/munurcoskun/Claude/321guess/lib/types.ts \
   /Users/munurcoskun/Claude/321guess/packages/core/src/types.ts
cp /Users/munurcoskun/Claude/321guess/lib/game.ts \
   /Users/munurcoskun/Claude/321guess/packages/core/src/game.ts
cp /Users/munurcoskun/Claude/321guess/lib/game.test.ts \
   /Users/munurcoskun/Claude/321guess/packages/core/src/game.test.ts
cp /Users/munurcoskun/Claude/321guess/lib/profanity.ts \
   /Users/munurcoskun/Claude/321guess/packages/core/src/profanity.ts
cp /Users/munurcoskun/Claude/321guess/lib/profanity.test.ts \
   /Users/munurcoskun/Claude/321guess/packages/core/src/profanity.test.ts
```

These four files (`types.ts`, `game.ts`, `profanity.ts`) have no import
that reaches outside themselves except `game.ts`'s
`import type { Club, Country, Dataset, Difficulty, Player, Round, Settings } from "./types"`
— already a relative same-directory import, so it resolves unchanged in
the new location. No edits needed.

- [ ] **Step 5: Create the barrel export**

```typescript
// packages/core/src/index.ts
export * from "./types";
export * from "./game";
export * from "./profanity";
```

- [ ] **Step 6: Install workspace dependencies**

Run: `cd /Users/munurcoskun/Claude/321guess && npm install`
Expected: npm links `node_modules/@321guess/core` to `packages/core`
(symlink), no errors.

- [ ] **Step 7: Run `packages/core`'s tests**

Run: `cd /Users/munurcoskun/Claude/321guess && npx vitest run packages/core`
Expected: PASS — same 20 tests (`game.test.ts`: 11, `profanity.test.ts`: 9)
that pass today at the root, now passing from their new location.

- [ ] **Step 8: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add package.json package-lock.json packages/core
git commit -m "Extract game logic, types, and profanity filter into packages/core"
```

---

### Task 2: Cross-platform dataset loader in `packages/core`

**Files:**
- Create: `/Users/munurcoskun/Claude/321guess/packages/core/src/dataset.ts`
- Modify: `/Users/munurcoskun/Claude/321guess/packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Dataset` type from `./types` (Task 1).
- Produces: `loadDataset(baseUrl: string): Promise<Dataset>` — fetches
  `${baseUrl}/data/{countries,leagues,clubs,players}.json` in parallel.
  Unlike today's `lib/data.ts` (`fetch("/data/countries.json")`, a
  same-origin relative URL that only resolves inside a browser tab), this
  takes an explicit `baseUrl` so both a Next.js web app and a React
  Native app (which has no "current page origin" to resolve a relative
  URL against) can call it the same way. `players.json` is 6.9MB
  (checked: `du -h public/data/players.json`) — too large to bundle as a
  static import, so this stays a runtime `fetch`, same as today.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/dataset.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadDataset } from "./dataset";

function mockFetchJson(payload: unknown) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) });
}

describe("loadDataset", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", undefined);
  });

  it("fetches all four dataset files from the given base URL", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url);
        return Promise.resolve({ json: () => Promise.resolve([]) });
      }),
    );

    await loadDataset("https://api.321guess.com");

    expect(calls.sort()).toEqual(
      [
        "https://api.321guess.com/data/clubs.json",
        "https://api.321guess.com/data/countries.json",
        "https://api.321guess.com/data/leagues.json",
        "https://api.321guess.com/data/players.json",
      ].sort(),
    );
  });

  it("caches the result — a second call does not re-fetch", async () => {
    const fetchSpy = mockFetchJson([]);
    vi.stubGlobal("fetch", fetchSpy);

    await loadDataset("https://api.321guess.com");
    await loadDataset("https://api.321guess.com");

    expect(fetchSpy).toHaveBeenCalledTimes(4); // 4 files, first call only
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/munurcoskun/Claude/321guess && npx vitest run packages/core/src/dataset.test.ts`
Expected: FAIL with "Cannot find module './dataset'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/core/src/dataset.ts
import type { Dataset } from "./types";

let cached: Dataset | null = null;

/**
 * Loads the four dataset JSON files from `${baseUrl}/data/*.json`. Takes an
 * explicit base URL (rather than a same-origin relative fetch) because
 * React Native has no "current page" to resolve a relative URL against —
 * every caller (web or native) passes the same apps/api origin.
 */
export async function loadDataset(baseUrl: string): Promise<Dataset> {
  if (cached) return cached;
  const [countries, leagues, clubs, players] = await Promise.all(
    ["countries", "leagues", "clubs", "players"].map((name) =>
      fetch(`${baseUrl}/data/${name}.json`).then((r) => r.json()),
    ),
  );
  cached = { countries, leagues, clubs, players };
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/munurcoskun/Claude/321guess && npx vitest run packages/core/src/dataset.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add it to the barrel export**

```typescript
// packages/core/src/index.ts
export * from "./types";
export * from "./game";
export * from "./profanity";
export * from "./dataset";
```

- [ ] **Step 6: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add packages/core/src/dataset.ts packages/core/src/dataset.test.ts packages/core/src/index.ts
git commit -m "Add cross-platform dataset loader to packages/core"
```

---

### Task 3: `apps/api` scaffold + backend lib files

**Files:**
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/package.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/next.config.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/tsconfig.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/supabase.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/online-db.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/push-db.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/fcm.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/server-dataset.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/daily-round.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/lib/daily-round.test.ts`

**Interfaces:**
- Consumes: `@321guess/core`'s `Club`, `Player`, `Settings`, `Dataset`
  types and `buildPool`, `pickClubClubRoundFromClubs` (from Task 1).
- Produces: everything `apps/api`'s API routes (Task 4) import —
  `getSupabaseServerClient` (`lib/supabase.ts`), the full `lib/online-db.ts`
  surface (`getDailyRound`, `createDailyRound`, `registerPlayer`,
  `getPlayerByToken`, `recordRoundStart`, `getRoundStart`, `recordGuess`,
  `countCorrectGuessesForQuestion`, `checkGuessRateLimit`,
  `countCorrectGuesses`, `finishRound`, `getTodayLeaderboard`,
  `getTotalLeaderboard`, plus `DailyQuestionRow`/`DailyRoundRow`/
  `FinishResult`/`LeaderboardEntry`/`TotalLeaderboardEntry` types),
  `lib/push-db.ts` (`upsertPushToken`, `getAllPushTokens`,
  `deletePushTokens`, `PushPlatform`, `PushTokenRow`), `lib/fcm.ts`
  (`sendDailyBroadcast`, `BroadcastResult`), `lib/daily-round.ts`
  (`ensureDailyRound`, `NoDailyMatchupsError`, `todayRoundDate`,
  `QUESTIONS_PER_ROUND`).

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@321guess/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@321guess/core": "*",
    "@supabase/supabase-js": "^2.45.4",
    "firebase-admin": "^13.0.0",
    "next": "^15.5.20",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "typescript": "^5.7.3",
    "vitest": "^3.0.4"
  }
}
```

- [ ] **Step 2: Create `apps/api/next.config.ts`**

No `next-intl` plugin (this app has no pages/locales) and no image
`remotePatterns` (that config was for the website's `<Image>` usage of
club logos, which lives in `apps/web`, not here). `transpilePackages`
lets Next.js compile `@321guess/core`'s TypeScript directly with no
separate build step for the workspace package:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@321guess/core"],
};

export default nextConfig;
```

- [ ] **Step 3: Create `apps/api/tsconfig.json`**

Same shape as the root's today, but without the `next-intl` plugin entry
and with `mobile`/other-app exclusions unnecessary since this is its own
project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Copy `supabase.ts`, `push-db.ts`, `fcm.ts`, `server-dataset.ts` unchanged**

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/lib
cp /Users/munurcoskun/Claude/321guess/lib/supabase.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/supabase.ts
cp /Users/munurcoskun/Claude/321guess/lib/push-db.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/push-db.ts
cp /Users/munurcoskun/Claude/321guess/lib/fcm.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/fcm.ts
cp /Users/munurcoskun/Claude/321guess/lib/server-dataset.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/server-dataset.ts
```

None of these four import from `./types` or `./game`, so nothing needs
rewriting.

- [ ] **Step 5: Copy `online-db.ts` unchanged**

```bash
cp /Users/munurcoskun/Claude/321guess/lib/online-db.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/online-db.ts
```

`online-db.ts` only imports `./supabase` (relative, already copied above)
— no type imports from `lib/types.ts`, so no edit needed.

- [ ] **Step 6: Copy `daily-round.ts` and `daily-round.test.ts`, rewriting the `./game`/`./types` imports to `@321guess/core`**

```bash
cp /Users/munurcoskun/Claude/321guess/lib/daily-round.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/daily-round.ts
cp /Users/munurcoskun/Claude/321guess/lib/daily-round.test.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/lib/daily-round.test.ts
```

Edit `apps/api/lib/daily-round.ts` — change only the import line, nothing
else in the file (all downstream references like `Player`, `buildPool`,
`pickClubClubRoundFromClubs` keep the same names):

```diff
-import { buildPool, pickClubClubRoundFromClubs } from "./game";
+import { buildPool, pickClubClubRoundFromClubs } from "@321guess/core";
 import { createDailyRound, getDailyRound, type DailyRoundRow } from "./online-db";
 import { loadServerDataset } from "./server-dataset";
-import type { Club, Player, Settings } from "./types";
+import type { Club, Player, Settings } from "@321guess/core";
```

`daily-round.test.ts` only imports `pickDailyQuestions` from `./daily-round`
(relative, unchanged) — no edit needed there.

- [ ] **Step 7: Install and run `apps/api`'s tests**

Run: `cd /Users/munurcoskun/Claude/321guess && npm install && npx vitest run apps/api`
Expected: PASS — same 3 tests from `daily-round.test.ts` that pass today,
now resolving `buildPool`/`pickClubClubRoundFromClubs`/`Player`/`Club`/
`Settings` through the `@321guess/core` workspace package.

- [ ] **Step 8: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/api/package.json apps/api/next.config.ts apps/api/tsconfig.json apps/api/lib package-lock.json
git commit -m "Scaffold apps/api and move backend lib files onto @321guess/core"
```

---

### Task 4: `apps/api` API routes

**Files:**
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/round/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/round/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/register/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/start/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/guess/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/finish/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/online/leaderboard/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/push/register/route.ts`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/app/api/cron/notify-daily-challenge/route.ts`

**Interfaces:**
- Consumes: everything produced by Task 3 (`apps/api/lib/*`) plus
  `validateUsername` from `@321guess/core` (in `online/register/route.ts`).
- Produces: the same HTTP contract as today's routes — same paths (minus
  the `app/api/` → `apps/api/app/api/` relocation, URL paths are
  unchanged), same request/response JSON shapes. This is a pure
  relocation; no route's behavior changes.

- [ ] **Step 1: Copy every route file that has no `@/lib/*` import unchanged**

`app/api/round/route.ts` and `app/api/online/{start,guess,finish,leaderboard}/route.ts`
import only from `@/lib/online-db` (path-aliased) — the alias itself
still resolves correctly once `apps/api/tsconfig.json`'s `paths: {"@/*": ["./*"]}`
(Task 3, Step 3) points at `apps/api/lib/online-db.ts`, so these need no
content edits, only relocation:

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/round
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/start
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/guess
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/finish
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/leaderboard

cp /Users/munurcoskun/Claude/321guess/app/api/round/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/round/route.ts
cp /Users/munurcoskun/Claude/321guess/app/api/online/start/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/start/route.ts
cp /Users/munurcoskun/Claude/321guess/app/api/online/guess/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/guess/route.ts
cp /Users/munurcoskun/Claude/321guess/app/api/online/finish/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/finish/route.ts
cp /Users/munurcoskun/Claude/321guess/app/api/online/leaderboard/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/leaderboard/route.ts
```

- [ ] **Step 2: Copy `online/round/route.ts` unchanged**

Already imports `ensureDailyRound`/`NoDailyMatchupsError`/`todayRoundDate`
from `@/lib/daily-round` and `DailyQuestionRow` from `@/lib/online-db` —
both alias-resolved, no content change:

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/round
cp /Users/munurcoskun/Claude/321guess/app/api/online/round/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/round/route.ts
```

- [ ] **Step 3: Copy `online/register/route.ts`, rewriting its `validateUsername` import**

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/register
cp /Users/munurcoskun/Claude/321guess/app/api/online/register/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/online/register/route.ts
```

Edit `apps/api/app/api/online/register/route.ts`:

```diff
 import { NextResponse } from "next/server";
-import { validateUsername } from "@/lib/profanity";
+import { validateUsername } from "@321guess/core";
 import { registerPlayer } from "@/lib/online-db";
```

- [ ] **Step 4: Copy `push/register/route.ts` and `cron/notify-daily-challenge/route.ts` unchanged**

Both already import exclusively from `@/lib/*` files that Task 3 copied
in as-is (`push-db`, `daily-round`, `fcm`) — no content change:

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/push/register
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/app/api/cron/notify-daily-challenge

cp /Users/munurcoskun/Claude/321guess/app/api/push/register/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/push/register/route.ts
cp /Users/munurcoskun/Claude/321guess/app/api/cron/notify-daily-challenge/route.ts \
   /Users/munurcoskun/Claude/321guess/apps/api/app/api/cron/notify-daily-challenge/route.ts
```

- [ ] **Step 5: Verify the route tree compiles**

Run: `cd /Users/munurcoskun/Claude/321guess/apps/api && npx tsc --noEmit`
Expected: no errors. (This surfaces any missed import rewrite before the
next task's runtime check.)

- [ ] **Step 6: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/api/app
git commit -m "Move API routes into apps/api"
```

---

### Task 5: `apps/api` data, SQL, cron config, and env

**Files:**
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/public/data/countries.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/public/data/leagues.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/public/data/clubs.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/public/data/players.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/supabase/schema.sql`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/supabase/push_tokens.sql`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/vercel.json`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/.env.example`
- Create: `/Users/munurcoskun/Claude/321guess/apps/api/.env.local`

**Interfaces:**
- Produces: `apps/api/public/data/*.json` served at
  `<apps/api origin>/data/*.json` by Next.js's static file serving —
  this is what `packages/core`'s `loadDataset(baseUrl)` (Task 2) will be
  called with once `apps/web` exists.

- [ ] **Step 1: Copy the dataset JSON files**

`server-dataset.ts` (Task 3) reads from `path.join(process.cwd(), "public", "data", ...)`
— `process.cwd()` is `apps/api` when Next.js runs from there, so the
files must live at `apps/api/public/data/`, matching where they are at
the root today relative to the root Next.js process:

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/public/data
cp /Users/munurcoskun/Claude/321guess/public/data/countries.json \
   /Users/munurcoskun/Claude/321guess/apps/api/public/data/countries.json
cp /Users/munurcoskun/Claude/321guess/public/data/leagues.json \
   /Users/munurcoskun/Claude/321guess/apps/api/public/data/leagues.json
cp /Users/munurcoskun/Claude/321guess/public/data/clubs.json \
   /Users/munurcoskun/Claude/321guess/apps/api/public/data/clubs.json
cp /Users/munurcoskun/Claude/321guess/public/data/players.json \
   /Users/munurcoskun/Claude/321guess/apps/api/public/data/players.json
```

- [ ] **Step 2: Copy the SQL migrations and cron config unchanged**

```bash
mkdir -p /Users/munurcoskun/Claude/321guess/apps/api/supabase
cp /Users/munurcoskun/Claude/321guess/supabase/schema.sql \
   /Users/munurcoskun/Claude/321guess/apps/api/supabase/schema.sql
cp /Users/munurcoskun/Claude/321guess/supabase/push_tokens.sql \
   /Users/munurcoskun/Claude/321guess/apps/api/supabase/push_tokens.sql
cp /Users/munurcoskun/Claude/321guess/vercel.json \
   /Users/munurcoskun/Claude/321guess/apps/api/vercel.json
```

- [ ] **Step 3: Copy the env files unchanged**

```bash
cp /Users/munurcoskun/Claude/321guess/.env.example \
   /Users/munurcoskun/Claude/321guess/apps/api/.env.example
cp /Users/munurcoskun/Claude/321guess/.env.local \
   /Users/munurcoskun/Claude/321guess/apps/api/.env.local
```

- [ ] **Step 4: Confirm `apps/api/.env.local` is gitignored**

Run: `cd /Users/munurcoskun/Claude/321guess && git check-ignore apps/api/.env.local`
Expected: prints `apps/api/.env.local` (confirms the root `.gitignore`'s
`.env*.local` pattern — or equivalent — still matches inside the new
`apps/api/` directory; if this prints nothing, stop and add an explicit
`apps/api/.env.local` line to `.gitignore` before continuing, since this
file holds the real Supabase service-role key).

- [ ] **Step 5: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/api/public apps/api/supabase apps/api/vercel.json apps/api/.env.example
git commit -m "Add data, SQL migrations, and cron config to apps/api"
```

(`.env.local` is not committed — it's gitignored, matching how the root
copy is handled today.)

---

### Task 6: End-to-end verification of `apps/api`

**Files:** none (verification only).

- [ ] **Step 1: Run apps/api's dev server**

Run: `cd /Users/munurcoskun/Claude/321guess/apps/api && npm run dev`
(background/separate terminal — leave running for the next steps)
Expected: starts on port 3000 with no errors.

- [ ] **Step 2: Regression-check the online round endpoint**

Run: `curl -s http://localhost:3000/api/online/round | head -c 300`
Expected: same JSON shape as today's root app returns — a `roundDate`,
`questions` array (5 entries), `totalPossible` — confirming
`ensureDailyRound` works unchanged from its new location and imports.

- [ ] **Step 3: Regression-check push registration validation**

Run:
```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d '{}' http://localhost:3000/api/push/register
```
Expected: `{"error":"invalid_body"}` / `HTTP 400` — same as the check run
when this route was first built.

- [ ] **Step 4: Regression-check the cron endpoint's auth gate**

Run: `curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/cron/notify-daily-challenge`
Expected: `{"error":"unauthorized"}` / `HTTP 401`.

- [ ] **Step 5: Regression-check username registration**

Run:
```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d '{"username":"amk","token":"'"$(uuidgen | tr 'A-Z' 'a-z')"'"}' \
  http://localhost:3000/api/online/register
```
Expected: `{"error":"invalid_username_blocked"}` / `HTTP 400` — confirms
`validateUsername` resolves correctly through `@321guess/core` (Task 4,
Step 3's import rewrite).

- [ ] **Step 6: Stop the dev server, run the full workspace test suite**

Run: `cd /Users/munurcoskun/Claude/321guess && npx vitest run`
Expected: PASS across `packages/core` (22 tests: 11 game + 9 profanity +
2 dataset) and `apps/api` (3 daily-round tests) — 25 total, all green.
(The root's own `lib/*.test.ts` files still exist and still pass too,
unaffected — they're untouched per the Global Constraints.)

- [ ] **Step 7: Commit the plan's completion marker**

No file changes in this task — nothing to commit. If Step 6 fails, fix
the failure and re-run before moving to the next plan (`apps/web`
scaffold), which depends on `apps/api` being verified working.

---

## What's next

The next plan (`apps/web` scaffold, per the design doc's "screen by
screen" pacing) will: (1) delete the now-superseded root `app/[locale]/*`,
`components/`, root `lib/`, root `app/api/`, `mobile/`,
`components/PushRegistration.tsx`, and trim the root `package.json`
(the deferred cleanup from this plan's "Sequencing note"); (2) create the
Expo Router project at `apps/web`; (3) port the simplest screen
(`ManualScreen`) first, calling `apps/api` at whatever origin it's
configured for locally.
