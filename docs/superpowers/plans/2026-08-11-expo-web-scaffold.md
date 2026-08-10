# apps/web Expo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this session executes it directly, no subagent dispatch — see note below). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the now-superseded root Next.js website (fully replaced by
`apps/api` + the planned `apps/web`) and stand up a bare Expo Router
project at `apps/web` that boots on web, proving the single-codebase
foundation works before any real screen is ported.

**Architecture:** Delete everything at the repo root that `apps/api`
(backend) or `packages/core` (shared logic) already absorbed in the prior
plan, plus the UI code that has no new home yet (it will be rewritten, not
moved, per the design doc). Scaffold `apps/web` via Expo's own
`create-expo-app` CLI using the official `default` template (expo-router +
TypeScript, already proven to work across web/iOS/Android — hand-rolling a
custom minimal template risks a subtle misconfiguration this environment
cannot verify, since it has no iOS Simulator or Android emulator installed
here — see Global Constraints).

**Tech Stack:** Expo SDK (latest, via `create-expo-app@latest`), Expo
Router, TypeScript. No NativeWind/styling library yet — deferred to the
first real screen-porting plan, since a placeholder screen doesn't need it.

## Global Constraints

- This environment has Xcode Command Line Tools but not full Xcode (no
  `simctl`, no iOS Simulator) and no Android SDK (no `adb`). Verification
  in this plan is limited to: TypeScript compiles, the Expo web target
  boots (`npx expo start --web` / `npx expo export -p web`), and
  `packages/core`/`apps/api`'s existing tests still pass. Native iOS/Android
  boots must be verified by the user locally (`npx expo run:ios` /
  `run:android`) — call this out explicitly when reporting Task 2 done, do
  not claim native verification that didn't happen.
- Deletions in Task 1 are safe to git history — every deleted file is
  fully recoverable via `git show <commit>:<path>` from before this plan's
  first commit. Do not hand-wring about permanence; git remembers.
- `apps/web`'s own `package.json` name: `@321guess/web`, matching the
  `@321guess/core` / `@321guess/api` naming already established.
- Per the human partner's decision earlier this session: no subagent
  dispatch for this plan — execute directly, one task at a time, commit
  after each.
- Never run `git reset --hard`, `git checkout -- .`, or `git clean` at any
  point in this plan — today's incident (an implementer subagent's git
  reset discarded uncommitted work) is exactly what these constraints
  exist to prevent. Use targeted `git add <specific paths>` and `git rm`
  only for paths this plan explicitly names.

---

### Task 1: Delete the superseded root website; move `scripts/` into `apps/api`

**Files:**
- Delete: `app/[locale]/` (layout.tsx, manual/page.tsx, online/page.tsx, page.tsx, play/page.tsx, privacy/page.tsx)
- Delete: `app/api/` (round/, online/{finish,guess,leaderboard,register,round,start}/, push/register/, cron/notify-daily-challenge/ — all already live in `apps/api/app/api/`)
- Delete: `app/globals.css`, `app/icon.tsx`, `app/opengraph-image.tsx`, `app/robots.ts`, `app/sitemap.ts`
- Delete: `components/` (all 11 files — Countdown.tsx, LanguageSwitcher.tsx, LogoTile.tsx, ManualScreen.tsx, OnlineScreen.tsx, PlayScreen.tsx, PushRegistration.tsx, RoundView.tsx, SetupScreen.tsx, ThemeSync.tsx, ThemeToggle.tsx)
- Delete: `lib/` (all 14 files — types/game/profanity/dataset already live in `packages/core`; daily-round/online-db/supabase/push-db/fcm/server-dataset already live in `apps/api`; `data.ts` and `live-players.ts` have no new home yet — they'll be re-derived from git history when a screen that needs them is ported)
- Delete: `middleware.ts`, `i18n/request.ts` (removes the `i18n/` dir), `locales/en.json`, `locales/tr.json` (removes the `locales/` dir)
- Delete: `mobile/` (the abandoned Capacitor wrapper — fully superseded by the Expo direction)
- Delete: `public/data/` (all 4 JSON files — already duplicated at `apps/api/public/data/`), removing the now-empty `public/` dir
- Delete: `data/player-club-additions.json` (already duplicated at `apps/api/data/`), removing the now-empty `data/` dir
- Delete: `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `next-env.d.ts`, `vercel.json`, `tsconfig.json` (all root-level, Next.js/Tailwind-specific — no source files remain at the repo root after this task, so root needs none of these)
- Delete: `.env.example`, `.env.local` (both already duplicated at `apps/api/.env.example` / `apps/api/.env.local`)
- Move: `scripts/enrich-popularity.ts`, `scripts/fetch-wikidata.ts`, `scripts/merge-players.ts`, `scripts/probe-leagues.ts`, `scripts/refetch-logos.ts`, `scripts/target-leagues.ts`, `scripts/logo-overrides.json` → `apps/api/scripts/` (same filenames) — these are the dataset-maintenance tools; they operate on `apps/api/public/data/*.json` now, not a root `public/`
- Modify: `apps/api/scripts/enrich-popularity.ts`, `apps/api/scripts/refetch-logos.ts`, `apps/api/scripts/fetch-wikidata.ts`, `apps/api/scripts/merge-players.ts` — rewrite their `../lib/types` import to `@321guess/core` (same pattern as the API routes in the prior plan)
- Modify: `package.json` (root) — trim to a bare workspace-root manifest
- Modify: `apps/api/package.json` — add the `fetch-data`/`enrich-popularity`/`refetch-logos` scripts (now that `scripts/` lives there) and the `tsx` devDependency they need

**Interfaces:** None — this task only removes and relocates files; nothing
in `packages/core` or `apps/api`'s existing routes/lib changes behavior.

- [ ] **Step 1: Confirm every deleted file's content already exists elsewhere or is intentionally being retired**

Run, from the repo root:
```bash
diff lib/types.ts packages/core/src/types.ts && echo "types.ts: safe, already in packages/core"
diff lib/game.ts packages/core/src/game.ts && echo "game.ts: safe, already in packages/core"
diff lib/profanity.ts packages/core/src/profanity.ts && echo "profanity.ts: safe, already in packages/core"
diff lib/daily-round.ts apps/api/lib/daily-round.ts && echo "daily-round.ts DIFFERS (expected: apps/api's import line was rewritten) — inspect before deleting"
diff lib/online-db.ts apps/api/lib/online-db.ts && echo "online-db.ts: safe, already in apps/api"
diff lib/supabase.ts apps/api/lib/supabase.ts && echo "supabase.ts: safe, already in apps/api"
diff lib/push-db.ts apps/api/lib/push-db.ts && echo "push-db.ts: safe, already in apps/api"
diff lib/fcm.ts apps/api/lib/fcm.ts && echo "fcm.ts: safe, already in apps/api"
diff public/data/players.json apps/api/public/data/players.json && echo "players.json: safe, already in apps/api"
diff data/player-club-additions.json apps/api/data/player-club-additions.json && echo "player-club-additions.json: safe, already in apps/api"
```
Expected: every `diff` prints nothing (files identical) except
`daily-round.ts`, which is expected to differ only in its import line
(already verified working in the prior plan's Task 3). If anything else
differs, STOP and report it — do not delete until the discrepancy is
understood.

- [ ] **Step 2: Move `scripts/` into `apps/api/scripts/`**

```bash
mkdir -p apps/api/scripts
git mv scripts/enrich-popularity.ts apps/api/scripts/enrich-popularity.ts
git mv scripts/fetch-wikidata.ts apps/api/scripts/fetch-wikidata.ts
git mv scripts/merge-players.ts apps/api/scripts/merge-players.ts
git mv scripts/probe-leagues.ts apps/api/scripts/probe-leagues.ts
git mv scripts/refetch-logos.ts apps/api/scripts/refetch-logos.ts
git mv scripts/target-leagues.ts apps/api/scripts/target-leagues.ts
git mv scripts/logo-overrides.json apps/api/scripts/logo-overrides.json
```
(`git mv` here is fine and intended — these files have no duplicate
elsewhere yet, unlike Task 1's earlier "copy, don't move" pattern for
things that already existed in two places.)

- [ ] **Step 3: Fix the moved scripts' imports**

Each of these four files has exactly one line to change — from a relative
`../lib/types` import to the workspace package:
```bash
grep -rn '"\.\./lib/types"' apps/api/scripts/
```
For each match, edit that one import line, e.g.:
```diff
-import type { Club } from "../lib/types";
+import type { Club } from "@321guess/core";
```
Apply the same edit to every file `grep` found (expected:
`enrich-popularity.ts`, `refetch-logos.ts`, `fetch-wikidata.ts` — check
`merge-players.ts` too, its import line uses `{ Player, Club }` in one
`import type` statement, same rewrite).

- [ ] **Step 4: Add the moved scripts to `apps/api/package.json` and add `tsx`**

```diff
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
+    "fetch-data": "tsx scripts/fetch-wikidata.ts",
+    "enrich-popularity": "tsx scripts/enrich-popularity.ts",
+    "refetch-logos": "tsx scripts/refetch-logos.ts",
     "test": "vitest run"
   },
```
```diff
   "devDependencies": {
     "@types/node": "^22",
     "@types/react": "^19",
     "typescript": "^5.7.3",
+    "tsx": "^4.19.2",
     "vitest": "^3.0.4"
   }
```

- [ ] **Step 5: Delete the superseded root files**

```bash
git rm -r "app/[locale]" app/api app/globals.css app/icon.tsx app/opengraph-image.tsx app/robots.ts app/sitemap.ts
git rm -r components lib
git rm middleware.ts
git rm -r i18n locales
git rm -r mobile
git rm -r public data
git rm next.config.ts postcss.config.mjs tailwind.config.ts next-env.d.ts vercel.json tsconfig.json
git rm .env.example .env.local
```
(`.env.local` is gitignored, so `git rm .env.local` will fail with "not
under version control" — that's expected; just `rm .env.local` for that
one file instead of `git rm`.)

- [ ] **Step 6: Trim root `package.json`**

```json
{
  "name": "321guess",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5.7.3",
    "vitest": "^3.0.4"
  }
}
```

- [ ] **Step 7: Reinstall and re-run the full test suite**

```bash
npm install
npx vitest run
```
Expected: `packages/core` (22 tests) and `apps/api` (3 tests) still pass —
25/25 — confirming the deletions didn't remove anything either workspace
actually depends on.

- [ ] **Step 8: Commit**

```bash
git add -A
git status --short   # review before committing — confirm only the expected deletions/moves/edits appear
git commit -m "Retire the superseded root Next.js website

Everything here already lives in apps/api (backend) or packages/core
(shared logic); the UI code (components/, app/[locale]/) has no new home
yet — it will be rewritten for apps/web, not moved, so it's deleted here
and recoverable from git history when that work starts."
```

---

### Task 2: Scaffold `apps/web` as an Expo Router project

**Files:**
- Create: `apps/web/` (generated by `create-expo-app`, contents not
  hand-specified here — see Global Constraints on why the official
  template is used as-is rather than hand-rolled)

**Interfaces:** None yet — this task produces a standalone, bootable Expo
app with no dependency on `@321guess/core` or `apps/api`. Wiring it to
either is the next plan's job, once a real screen needs them.

- [ ] **Step 1: Generate the project**

From the repo root:
```bash
npx create-expo-app@latest apps/web -t default --no-install --no-agents-md -y
```
`--no-install` skips `create-expo-app`'s own `npm install` (it would
create a nested `apps/web/package-lock.json`, conflicting with the
workspace's single root lockfile) — Step 3 installs via the workspace
root instead. `--no-agents-md` skips generating `AGENTS.md`/`CLAUDE.md`/
`.claude/settings.json` inside `apps/web`, which would otherwise sit
oddly nested under this same Claude Code session's project.

- [ ] **Step 2: Rename the package to match workspace convention**

Open `apps/web/package.json` and change just the `"name"` field:
```diff
-  "name": "web",
+  "name": "@321guess/web",
```
(Leave every other field — Expo/React Native version pins, scripts —
exactly as the template generated them; don't hand-edit generated
dependency versions.)

- [ ] **Step 3: Install from the workspace root**

```bash
cd /Users/munurcoskun/Claude/321guess
npm install
```
Expected: no errors; `node_modules/@321guess/web` appears as a workspace
symlink alongside `@321guess/core` and `@321guess/api`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web
npx tsc --noEmit
```
Expected: no errors (the generated template ships a valid `tsconfig.json`
already).

- [ ] **Step 5: Verify the web target boots**

```bash
npx expo export -p web
```
(`expo export` rather than `expo start` — this runs once and exits with a
pass/fail, suited to non-interactive verification, instead of leaving a
dev server attached to the terminal.) Expected: completes without error,
producing a `dist/` output directory. Confirm with:
```bash
ls dist/
```

- [ ] **Step 6: Record what native verification still needs a human**

This environment has no iOS Simulator or Android emulator (Global
Constraints). Do not attempt `expo run:ios`/`run:android` here. Note in
the task report that the user must run these locally once they're ready:
```bash
cd apps/web
npx expo run:ios      # requires full Xcode, not just Command Line Tools
npx expo run:android  # requires Android Studio / SDK
```

- [ ] **Step 7: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web package.json package-lock.json
git status --short   # review — apps/web should be the only large new addition
git commit -m "Scaffold apps/web as an Expo Router project

Official create-expo-app 'default' template (expo-router + TypeScript),
unmodified except for the package name. Verified: TypeScript compiles,
'npx expo export -p web' produces a working web build. Native iOS/Android
boots need a human with Xcode/Android Studio installed — this environment
has neither."
```

---

### Task 3: Prove the workspace linkage end-to-end

**Files:**
- Modify: one existing screen file inside `apps/web/app/` (exact path
  depends on what the `default` template generated in Task 2 — inspect
  `apps/web/app/` after Task 2 and pick its main/home screen)

**Interfaces:**
- Consumes: any one export from `@321guess/core` (e.g. `todayRoundDate`
  from `./dataset`'s sibling exports, or simpler — `QUESTIONS_PER_ROUND`
  isn't exported from core; use something genuinely exported, confirm via
  `apps/web`'s own `node_modules/@321guess/core` symlink resolution).

This task exists to catch a Metro-bundler-vs-workspace-package problem
now, cheaply, before any real screen porting depends on it working.

- [ ] **Step 1: Add a temporary import and render**

In the template's home screen component, add:
```tsx
import { validateUsername } from "@321guess/core";
```
and render its result somewhere visible, e.g.:
```tsx
<Text>{JSON.stringify(validateUsername("test_user"))}</Text>
```

- [ ] **Step 2: Re-run the web export to confirm Metro resolves the workspace package**

```bash
cd apps/web
npx expo export -p web
```
Expected: succeeds (if `@321guess/core` fails to resolve, this step fails
with a clear module-not-found error — that's the thing this task is
checking for).

- [ ] **Step 3: Revert the temporary change**

```bash
git checkout -- apps/web/app/   # or the specific file touched in Step 1
```
This is safe here — Step 1's edit was never committed, so nothing is
discarded except this task's own throwaway probe.

- [ ] **Step 4: Report the finding**

No commit for this task (the point was to prove linkage works, not to
ship a demo import) — record in the final summary whether
`@321guess/core` resolved cleanly from `apps/web`, since the next plan
(first real screen port) depends on this working.

---

## What's next

The next plan ports the first real screen (`ManualScreen`, per the design
doc's "simplest first" ordering) from `git show main:components/ManualScreen.tsx`
(and its dependencies: `RoundView.tsx`, `LogoTile.tsx`, `ThemeToggle.tsx`,
`LanguageSwitcher.tsx`, `lib/data.ts`, `lib/live-players.ts` — all
retrievable from git history after this plan's Task 1 deletes them) into
`apps/web`, introducing NativeWind for styling and a React Native-compatible
i18n library to replace `next-intl`.
