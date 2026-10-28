# Challenge Invite Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A challenge creator can share one link that any number of friends open, either in a browser at `www.321guess.com/m/<code>` or in the app. Each friend creates a username, plays the creator's exact questions, and sees a 1-to-1 result.

**Architecture:** A new `challenge_links` row is a template that points at the creator's finished "source" challenge. Joining a link clones the source into a normal 1-to-1 `challenges` row with the joiner as opponent. The clone copies the questions and the creator's score, so the existing guess, finish, rivalry and push code runs unchanged. One Expo Router screen (`/m/[code]`) serves both the static web export and the native app. Native opens it through the existing `guess321://` scheme.

**Tech Stack:** Next.js 15 route handlers + Supabase (apps/api), Expo Router 6 / React Native + NativeWind with static web export (apps/web), Vitest, `@321guess/core`.

**Spec:** `docs/superpowers/specs/2026-10-28-challenge-invite-link-design.md`

## Global Constraints

- Link URL format: `https://www.321guess.com/m/<code>`. In-app open: `guess321://m/<code>`.
- Link lifetime: 7 days, the same as `challenges.expires_at`.
- Any number of people may join one link. Each player joins a given link **at most once**. Reopening returns their existing clone and never a second attempt.
- Each joiner's result shows only themselves vs the creator. There is no shared leaderboard.
- The invite button label is "Arkadaşını davet et" / "Invite a friend". It opens the system share sheet (`shareOrCopy` in `apps/web/src/lib/share.ts`) and never deep-links into WhatsApp.
- Every game mode shows the 3-2-1 `Countdown` before play.
- Usernames go through `validateUsername` from `@321guess/core`. The server's `/api/online/register` stays authoritative.
- No player_token may cross a JSON response. Use `toClientChallenge` and never return raw rows.
- Answers (`answer_player_ids`) are never returned by public link endpoints.
- The deep-link and deferred-install flows, and any link leaderboard, are out of scope.
- Production DB migrations are run by the user in the Supabase SQL Editor. Nothing in this plan runs DDL itself.
- API deploys: `.claude/deploy-api.sh`. OTA: `apps/web/scripts/ota-production.sh "msg"`. Never use a bare `eas update`.
- The web deploy happens only after the user has seen the local preview and approved it.

## Review Focus

1. **A link opened by its own creator** should show their own result and the play count, not an error or a playable round. This is pinned by `isLinkJoinable` returning `own_link` (Task 2) and the InviteScreen branch (Task 6).
2. **A link opened after it was revoked or expired** should show a clear "this link is no longer active" state. It must never create a clone. This is pinned by `isLinkJoinable` tests for `revoked` and `expired` (Task 2) and the join route's 410 (Task 4).
3. **Two near-simultaneous joins by the same player** (for example, a double tap) must yield one clone. This is pinned by the unique index `(link_code, opponent_token)` (Task 1). `joinLink` must treat the unique-violation error `23505` as "return existing" (Task 3).
4. **A friend who already played reopens the link** and should land on their result. They must not get a second play. This is pinned by `joinLink` returning the existing clone whose status is `completed`, and InviteScreen routing `completed` to the result (Task 6).
5. **A browser with no stored identity** must show username entry first. A `blocked`/`taken` registration error shows the existing localized username error messages. This is pinned in Task 6's manual check list.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/supabase/challenge_links.sql` (create) | The `challenge_links` table, `challenges.link_code` and the unique index |
| `apps/api/lib/challenge-link.ts` (create) | Pure helpers: code generation, joinability, URL |
| `apps/api/lib/challenge-link.test.ts` (create) | Vitest for the pure helpers |
| `apps/api/lib/challenge-link-db.ts` (create) | Supabase access for links: create/get, invite info, join (clone), revoke, list |
| `apps/api/app/api/challenges/[id]/link/route.ts` (create) | Creator creates or gets the link for a finished challenge |
| `apps/api/app/api/links/[code]/route.ts` (create) | Public invite info |
| `apps/api/app/api/links/[code]/join/route.ts` (create) | Joiner gets or creates their clone |
| `apps/api/app/api/links/[code]/revoke/route.ts` (create) | Creator revokes |
| `apps/api/lib/challenge-db.ts` (modify `listChallengesForPlayer`) | Exclude link sources and clones from `outgoing`; add `links` |
| `apps/web/src/lib/challenge-api.ts` (modify) | Client calls and types for the four endpoints and the new list field |
| `apps/web/src/components/ChallengeScreen.tsx` (modify) | Invite button on the send screen; link rows (play count + Sil) in Bekleyenler |
| `apps/web/src/components/InviteScreen.tsx` (create) | The `/m/[code]` flow: invite → username → countdown → play → result |
| `apps/web/src/app/m/[code].tsx`, `apps/web/src/app/en/m/[code].tsx` (create) | Routes rendering `InviteScreen` |
| `apps/web/vercel.json` (modify) | Rewrite `/m/:code` and `/en/m/:code` to the exported dynamic page |
| `apps/web/src/locales/tr.json`, `en.json` (modify) | New `invite.*` and `challenge.*` strings |

---

### Task 1: Database migration

**Files:**
- Create: `apps/api/supabase/challenge_links.sql`

**Interfaces:**
- Produces:
  - Table `challenge_links(code text primary key, source_challenge_id uuid not null references challenges(id), creator_token uuid not null references online_players(player_token), created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '7 days'), revoked_at timestamptz)`
  - Column `challenges.link_code text references challenge_links(code)`, nullable
  - Unique index `challenges_link_joiner_idx on challenges (link_code, opponent_token) where link_code is not null`
  - RLS enabled on `challenge_links` with no policies, following the same convention as `challenges.sql`'s header

- [ ] **Step 1: Write `challenge_links.sql`** with the objects above. Use `if not exists` everywhere, so re-running it is a no-op. Add a header comment in the style of `club_colors.sql`: additive-only, run after `challenges.sql`.
- [ ] **Step 2: Ask the user to run it** in the Supabase SQL Editor. Then ask them to paste the output of `select column_name from information_schema.columns where table_name in ('challenge_links') or (table_name='challenges' and column_name='link_code');`. Expected: 6 `challenge_links` columns plus `link_code`.
- [ ] **Step 3: Commit**

```bash
git add apps/api/supabase/challenge_links.sql
git commit -m "Add challenge_links migration for multi-player invite links"
```

### Task 2: Pure link helpers

**Files:**
- Create: `apps/api/lib/challenge-link.ts`
- Test: `apps/api/lib/challenge-link.test.ts`

**Interfaces:**
- Produces:
  - `LINK_CODE_LENGTH = 8`
  - `generateLinkCode(random?: (n: number) => Uint8Array): string`: lowercase letters and digits only, excluding `0 o 1 l i`, exactly 8 characters. Defaults to `crypto.getRandomValues`.
  - `linkUrl(code: string): string` → `https://www.321guess.com/m/${code}`
  - `type LinkState = { creatorToken: string; expiresAt: string; revokedAt: string | null }`
  - `isLinkJoinable(link: LinkState, joinerToken: string, now: Date): { ok: true } | { ok: false; reason: "revoked" | "expired" | "own_link" }`. Check order: revoked → expired → own_link.

- [ ] **Step 1: Write failing tests**

```ts
it("generates 8-char codes from the unambiguous alphabet", () => {
  for (let i = 0; i < 200; i++) expect(generateLinkCode()).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
});
it("builds the www link URL", () => {
  expect(linkUrl("abcd2345")).toBe("https://www.321guess.com/m/abcd2345");
});
const base = { creatorToken: "c", expiresAt: "2026-11-04T00:00:00Z", revokedAt: null };
it("allows a different player before expiry", () => {
  expect(isLinkJoinable(base, "j", new Date("2026-11-01T00:00:00Z"))).toEqual({ ok: true });
});
it("rejects revoked first, even if also expired", () => {
  expect(isLinkJoinable({ ...base, revokedAt: "2026-10-30T00:00:00Z" }, "j", new Date("2026-12-01T00:00:00Z")))
    .toEqual({ ok: false, reason: "revoked" });
});
it("rejects after expiry", () => {
  expect(isLinkJoinable(base, "j", new Date("2026-11-05T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
});
it("rejects the creator's own token", () => {
  expect(isLinkJoinable(base, "c", new Date("2026-11-01T00:00:00Z"))).toEqual({ ok: false, reason: "own_link" });
});
```

- [ ] **Step 2: Run and see them fail.** Run `npx vitest run apps/api/lib/challenge-link.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three functions** in `challenge-link.ts`.
- [ ] **Step 4: Run and see them pass.** Same command. Expected: 6 passed.
- [ ] **Step 5: Commit** (`Add pure helpers for challenge invite links`).

### Task 3: Link data access

**Files:**
- Create: `apps/api/lib/challenge-link-db.ts`

**Interfaces:**
- Consumes:
  - From Task 2: `generateLinkCode`, `isLinkJoinable`, `linkUrl`
  - From `challenge-db.ts`: `getChallenge`, `ChallengeRow`, `setChallengeDelivery`
- Produces:
  - `getOrCreateLink(sourceChallengeId: string, creatorToken: string): Promise<{ code: string; url: string } | { error: "not_creator" | "not_finished" | "not_linkable" }>`
    - Requires a `challenge_scores` row for `(source, creator)`.
    - Reuses an existing non-revoked link for the same source.
    - On a new link it calls `setChallengeDelivery(id, "link", null)`. A false result means the challenge was already sent, so it returns `not_linkable`.
    - It retries code generation up to 3 times on a primary-key collision.
  - `getLinkInvite(code: string): Promise<LinkInvite | null>`, where `LinkInvite = { code; creatorUsername: string; creatorScore: { correctCount: number; totalPossible: number }; mode: string; difficulty: string; playedCount: number; active: boolean }`
    - `active` = not revoked and not expired.
    - `playedCount` = clones with `status = 'completed'`.
  - `joinLink(code: string, joinerToken: string): Promise<{ challenge: ChallengeRow } | { error: "not_found" | "revoked" | "expired" | "own_link" }>`
    - Returns the joiner's existing clone if any.
    - Otherwise inserts a clone: `creator_token` = link creator, `opponent_token` = joiner, `delivery_type 'link'`, `status 'pending'`, `link_code`, the source's mode/difficulty/included_leagues, and `expires_at` = the link's `expires_at`.
    - It then copies every `challenge_questions` row and the creator's `challenge_scores` row onto the clone.
    - On a unique violation (`23505`) from the insert, it re-reads and returns the existing clone.
    - If copying questions or the score fails, it deletes the clone and rethrows.
  - `revokeLink(code: string, creatorToken: string): Promise<boolean>`: sets `revoked_at = now()` where creator matches and it isn't already revoked.
  - `listLinksForCreator(creatorToken: string): Promise<{ code: string; url: string; playedCount: number; createdAt: string; expiresAt: string }[]>`: non-revoked links, newest first.

- [ ] **Step 1: Implement the five functions.** Follow the existing patterns in `challenge-db.ts`: `getSupabaseServerClient()`, `throw error` on Supabase errors, snake_case ↔ camelCase mapping at the boundary.
- [ ] **Step 2: Type-check.** Run `cd apps/api && npx tsc --noEmit`. Expected: no output, exit 0.
- [ ] **Step 3: Commit** (`Add Supabase access layer for challenge invite links`).

Behavior is verified end-to-end in Task 4 Step 3. These functions need a live database and the repo has no Supabase test harness.

### Task 4: API routes, list change, deploy

**Files:**
- Create the four route files in the File Structure table.
- Modify: `apps/api/lib/challenge-db.ts` (`listChallengesForPlayer`)

**Interfaces:**
- Consumes: Task 3's functions
- Produces (all with an `OPTIONS` 204 handler like the existing routes; token validated with the same `UUID_RE`; unknown token → 401 `unknown_player`):
  - `POST /api/challenges/[id]/link` with body `{ token }` → 200 `{ code, url }`. `not_creator` → 403. `not_finished` / `not_linkable` → 409.
  - `GET /api/links/[code]` (public, no token) → 200 `LinkInvite`, or 404 `no_link`.
  - `POST /api/links/[code]/join` with body `{ token }` → 200 `toClientChallenge(challenge)`. `not_found` → 404. `revoked` / `expired` → 410. `own_link` → 409.
  - `POST /api/links/[code]/revoke` with body `{ token }` → 200 `{ revoked: true }`, or 404 `not_revocable`.
  - `GET /api/challenges/list` gains `links: Awaited<ReturnType<typeof listLinksForCreator>>`. `outgoing` excludes rows whose `link_code` is non-null, and rows with `delivery_type = 'link'` and a null `opponent_token` (the source).

- [ ] **Step 1: Implement the routes and the list change.** Copy the structure of `app/api/challenges/[id]/cancel/route.ts`.
- [ ] **Step 2: Type-check and run the unit tests.** Run `cd apps/api && npx tsc --noEmit && cd ../.. && npx vitest run apps/api/lib/challenge-link.test.ts`. Expected: tsc clean, 6 passed.
- [ ] **Step 3: Deploy and smoke-test.** Run `.claude/deploy-api.sh`. Then, with two throwaway players registered through `/api/online/register` (usernames `zzlinktest_a` and `zzlinktest_b`):
  1. A creates a challenge, guesses once and finishes it via the existing endpoints.
  2. A calls `/link`. Expect a `url` matching `/m/[a-hjkmnp-z2-9]{8}$`.
  3. `GET /api/links/<code>`. Expect `creatorUsername: "zzlinktest_a"`, `playedCount: 0`, `active: true`, and no `answer` field anywhere.
  4. B calls `/join` twice. Both responses carry the same `id`.
  5. A calls `/join`. Expect 409.
  6. B finishes. Expect `completed: true` with `opponentResult.username` = `"zzlinktest_a"`.
  7. `GET /api/links/<code>`. Expect `playedCount: 1`.
  8. A calls `/revoke`, then a new player C joins. Expect 410.
  9. A's `/api/challenges/list` shows the link in `links` and nothing link-related in `outgoing`.

  Finally, delete both test players with `npx tsx --env-file=.env.local scripts/delete-online-player.ts zzlinktest_a` (same for `_b`, `_c`). Extend that script to also delete `challenge_links` rows whose `creator_token` is the player, before deleting challenges.
- [ ] **Step 4: Commit** (`Add invite link API routes and list support`).

### Task 5: App — invite button and link rows

**Files:**
- Modify: `apps/web/src/lib/challenge-api.ts`, `apps/web/src/components/ChallengeScreen.tsx`, locales

**Interfaces:**
- Consumes: Task 4's endpoints
- Produces in `challenge-api.ts`:
  - `createChallengeLink(token, challengeId): Promise<ApiResult<{ code: string; url: string }>>`
  - `fetchLinkInvite(code): Promise<ApiResult<LinkInvite>>`
  - `joinLink(token, code): Promise<ApiResult<ChallengeRow> | { status: "gone" } | { status: "own" }>`, mapping 410 → `gone` and 409 → `own`
  - `revokeLink(token, code): Promise<ApiResult<{ revoked: true }>>`
  - Types `LinkInvite` (the same shape as Task 3) and `ChallengeLinkSummary`
  - `ChallengeList` gains `links: ChallengeLinkSummary[]`

- [ ] **Step 1: Add the client functions and types.**
- [ ] **Step 2: Send screen (`screen.kind === "new-send"`).** Add an `ArenaPressable` "Arkadaşını davet et" above the username search.
  - It calls `createChallengeLink`, then `shareOrCopy(t("inviteShareText", { score, total, url }))`.
  - If it returns `copied`, show `t("linkCopied")`.
  - Text, TR: `"321guess'te seni meydan okumaya davet ediyorum! Benim skorum {score}/{total}, geçebilir misin? {url}"`. EN: `"I'm challenging you on 321guess! I scored {score}/{total}, can you beat me? {url}"`.
  - Button label keys: `challenge.inviteFriend` = "Arkadaşını davet et" / "Invite a friend".
- [ ] **Step 3: Bekleyenler.** Render each `list.links` entry as a row above the outgoing rows:
  - 🔗 icon
  - `t("linkRow", { count: playedCount })`, with TR `"Link ile paylaşıldı · {count} kişi oynadı"` and EN `"Shared via link · {count} played"`
  - the existing **Sil** button and confirm dialog, calling `revokeLink`, optimistically removing the row and then calling `refreshList`. Reuse the `confirmDeleteOutgoing` pattern by generalizing its callback.
- [ ] **Step 4: Type-check.** Run `cd apps/web && npx tsc --noEmit`. Expected: exit 0.
- [ ] **Step 5: Commit** (`Add invite-a-friend link sharing and link rows to the challenge hub`).

### Task 6: InviteScreen and routes

**Files:**
- Create: `apps/web/src/components/InviteScreen.tsx`, `apps/web/src/app/m/[code].tsx`, `apps/web/src/app/en/m/[code].tsx`
- Modify: `apps/web/vercel.json`, locales

**Interfaces:**
- Consumes:
  - From Task 5: `fetchLinkInvite`, `joinLink`
  - Existing: `submitChallengeGuess`, `finishChallenge`, `registerPlayer`, `loadIdentity`/`saveIdentity`, `validateUsername`, `loadDataset`, `RoundPlayView`, `Countdown`, `ArenaBackground`, `ArenaPressable`, `useScrollToEndOnKeyboard`
- Produces: `export function InviteScreen({ code }: { code: string })`. Both routes read `code` with `useLocalSearchParams` and render it.

Phases (one `useState` union):
- `loading`
- `inactive`: link not found, revoked or expired. Show `invite.inactive` and a button to the home page.
- `invite`: "{username} seni meydan okumaya davet etti", the creator's score, a **Başla** button, and on web only an "Uygulamada aç" link to `guess321://m/<code>`.
- `username`: shown only when there is no stored identity. Reuse the username form markup and the error keys from the Daily flow in `OnlineScreen`. On success, `saveIdentity`.
- `own`: the creator opened their own link. Show "Bu senin linkin", `playedCount`, and a button to `/challenge` on native or home on web.
- `countdown`: `<Countdown onDone=…>`, mandatory.
- `playing`: `RoundPlayView` over `challenge.questions`, with the same next/finish buttons and guess handling as ChallengeScreen's `opponent-playing` screen.
- `result`: my score vs `opponentResult` (the creator) using the existing `youScored` / `opponentScored` / `youWon` / `youLost` / `tied` keys. On web it also shows `invite.appSoon`.

Rules:
- Pressing **Başla** calls `joinLink`.
  - `gone` → `inactive`
  - `own` → `own`
  - a clone with `status: "completed"` → fetch the result via `finishChallenge` (idempotent: it returns the existing score) → `result`
  - otherwise → `countdown`
- Use the arena theme on both platforms. The invite flow is a game screen, and the arena tokens are fixed colors in `tailwind.config.js`.
- On web, render a static `<Head>` with `og:title` = `invite.ogTitle` ("Arkadaşın seni 321guess'te meydan okumaya davet etti!") and `og:description` = `invite.ogDescription`. The per-creator name is in the share text, because static export can't render per-code tags.
- New TR/EN keys under `invite`: `title` ("{username} seni meydan okumaya davet etti"), `score` ("{username}'in skoru: {correct}/{total}"; builder: avoid the possessive suffix by using "Skoru: {correct}/{total}" under the name), `start`, `openInApp`, `inactive`, `own`, `appSoon` ("321guess çok yakında App Store ve Google Play'de!"), `ogTitle`, `ogDescription`.
- `vercel.json` gets `"rewrites": [{ "source": "/m/:code", "destination": "/m/[code]" }, { "source": "/en/m/:code", "destination": "/en/m/[code]" }]`. Keep `cleanUrls`.

- [ ] **Step 1: Implement the routes and `InviteScreen`.**
- [ ] **Step 2: Type-check.** Run `cd apps/web && npx tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Check the web export locally.**
  - Export with production env, the same as `ota-production.sh` does: `export $(jq …) && npx expo export --platform web --clear --output-dir <scratchpad>/web-preview`.
  - Confirm `web-preview/m/[code].html` exists.
  - Serve it with a `serve.json` mirroring the rewrites, then open `/m/<real code from a fresh Task 4-style test link>` at 390×844 in Playwright.
  - Walk every phase: inactive (`/m/zzzzzzzz`), invite, username, countdown, playing, result, and own (opened with the creator's identity).
  - Screenshot each phase.
- [ ] **Step 4: Check native in the iOS simulator or on a TestFlight device after the OTA (Task 7).** `guess321://m/<code>` should open the invite screen with the app identity.
- [ ] **Step 5: Commit** (`Add the /m/[code] invite screen for web and app`).

### Task 7: Ship

- [ ] **Step 1: Show the user the Task 6 screenshots** and the local preview URL. Wait for explicit approval of the web look.
- [ ] **Step 2: Deploy the web.** Deploy `321guess` (apps/web) to production via the Vercel CLI. This needs a token with access to that project, so ask the user to add it to the token's scope or to create one. Use production env, then verify that `https://www.321guess.com/m/zzzzzzzz` renders the inactive state.
- [ ] **Step 3: OTA.** Run `apps/web/scripts/ota-production.sh "Invite links"`. Expected: `Verified: bundle points at https://api.321guess.com`.
- [ ] **Step 4: Hand off a TestFlight checklist** to the user: share a link from the app → open it in a phone browser (a second person, or a private tab) → play → the creator gets a push and a Rivalries entry → Sil revokes it → the link shows inactive.
