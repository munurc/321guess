# Challenge Mode (Meydan Oku) Design

## Context

321guess currently has two ways to play: fully offline (Kulüp×Kulüp, Ülke×Kulüp, Manuel oyun — one device, pass-and-play) and Daily Challenge (a shared daily round everyone plays independently, compared via a leaderboard — async, but not head-to-head against a chosen opponent).

The user decided to postpone App Store/Play Store submission specifically to ship a real head-to-head competitive mode first — offline play + Daily Challenge alone were judged not enough to launch on. This is the spec for that mode: **Meydan Oku** (Challenge Mode).

Identity today is lightweight: a username plus a random `player_token` generated client-side and stored in `AsyncStorage`/`localStorage` (`321guess.online.player`), no password or real account. Push notification infrastructure already exists (`push_tokens` table, Expo push tokens, used today only for the daily-challenge-ready cron broadcast) — Challenge Mode reuses it for real-time, per-event notifications instead of a cron.

## Goals

- Two specific players compete asynchronously (not live/real-time) on the same round, comparing correct-count and speed.
- A challenge can be sent to a specific existing user (search), to anyone via a shareable link (no account needed to receive it), or resolved automatically against a random-opponent queue.
- A persistent head-to-head record is kept between any two players who've played each other.
- Optional account linking (Google / Apple / email) lets a player recover their identity, history, and rivalries on a new device — without requiring an account to play at all.
- None of this touches or degrades the native offline experience; every addition is new screens/endpoints, not a rewrite of existing ones.

## Non-Goals (v1)

- Synchronous/live play (both players online at the same time, real-time state). Explicitly deferred — async only for now.
- A browsable "open challenges" list. Random matching is fully server-decided (see below), never a list the player picks from.
- Forcing an account. The existing lightweight username+token identity remains the default; linking is opt-in.

## Information Architecture

The Setup screen's mode list becomes **3 equal-weight top-level entries** (no single "hero" card anymore, since two of the three are now online/social):

1. **Günlük Meydan Okuma** (existing Daily Challenge, unchanged behavior)
2. **Arkadaşına Meydan Oku** (new)
3. **Tek Cihazdan Oyna** (renamed umbrella for the existing offline modes — was previously flat on this same screen; Kulüp×Kulüp / Ülke×Kulüp / Manuel oyun now live one level down, behind this entry, so they don't show on the first screen)

"Tek Cihazdan Oyna" replaces the English "offline" naming and directly communicates the mechanic: play together on one device, no internet needed.

Visually, entries 1 and 2 get the game's existing "3D pressed button" treatment (bold fill color, thick bottom border, drop shadow) to read as inviting/game-like rather than flat list rows; entry 3 stays visually quieter (bordered, not filled) since it's no longer the feature the launch is built around.

**Arkadaşına Meydan Oku** opens a hub screen with:
- Incoming pending challenges (someone challenged you, you haven't played yet)
- Your outgoing challenges still waiting on an opponent
- Head-to-head history per rival (e.g. "Ahmet — 3-1 öndesin")
- A **"Rastgele Rakip"** button
- A **"+ Yeni Meydan Okuma"** button (targeted flow, described below)

## Core Flow: Targeted Challenge ("Arkadaşına Meydan Oku")

1. Creator picks difficulty, league set, and mode (Kulüp×Kulüp / Ülke×Kulüp) — same controls as the existing offline setup screen.
2. A `challenges` row and its round (`challenge_questions`) are created; the creator plays it immediately. Playing first (before an opponent is attached) is deliberate — the creator sets the score to beat.
3. After finishing, the creator picks delivery:
   - **Search an existing user** by username (autocomplete against registered `online_players`). Selecting one sets `opponent_token` immediately and fires an instant push notification to them. There is no free-text name field — if the search finds no match, there's nothing to type instead; the creator uses link delivery.
   - **Generate a link** — no name entry at all. The creator shares it through any external channel (WhatsApp, SMS, etc.). Whoever opens it first becomes the opponent (claimed atomically on first `GET`), whether or not they already have a 321guess identity — first-time openers create a username on the spot, exactly like today's Daily Challenge onboarding.
4. The opponent plays the same round. On finishing, both players see the result screen: score comparison, win/lose/tie, updated head-to-head record, and a **Rovanş** button that immediately starts a new targeted challenge against the same opponent.
5. An unplayed challenge (opponent never opens it) expires after 7 days.

## Core Flow: Random Opponent

No configuration screen — tapping **"Rastgele Rakip"** always uses fixed settings: difficulty **Kolay**, mode **Kulüp×Kulüp**, and a curated 7-league pool (Bundesliga, Eredivisie, La Liga, Ligue 1, Premier League, Serie A, Süper Lig — excluding Belgian Pro League, Brasileirão Série A, Liga MX, Liga Portugal, Major League Soccer, Primera División (Arg), Saudi Pro League, Scottish Premiership). Fixing everything keeps the matching pool homogeneous and keeps random opponents on a level footing.

The server decides the player's role, invisibly:

- If a `challenges` row exists with `delivery_type='random'`, `opponent_token IS NULL`, `status='waiting'`, `expires_at > now()`, and `creator_token <> me` — claim the oldest one (`FOR UPDATE SKIP LOCKED` to make concurrent claims race-safe), set `opponent_token = me`, and hand back that same round to play. Since the creator already finished, the result screen appears immediately after I finish.
- Otherwise, create a new `challenges` row (`delivery_type='random'`, `creator_token = me`, `opponent_token = NULL`, `status='waiting'`) with the fixed settings, generate its round, and let me play it. It now sits in the queue; when someone else is matched into it, I get a push notification and the result screen becomes available.

A head-to-head `rivalries` record is kept for random-matched pairs exactly like targeted ones — once matched, you know who you played.

## Data Model

New tables, following the existing `daily_*` schema's conventions exactly (service-role-only access via RLS with no policies, `player_token` foreign keys into `online_players`):

```sql
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

A challenge is "completed" once both `creator_token` and `opponent_token` have a row in `challenge_scores` for it — computed at read time (or set explicitly via `status='completed'` when the second score is written), whichever proves simpler during implementation.

## API

New routes under `apps/api/app/api/challenges/`, following the existing `/api/online/*` conventions (validation style, error shapes, service-role Supabase client):

- `POST /create` — body `{ playerToken, mode, difficulty, includedLeagues }`. Creates the `challenges` row (`delivery_type` left `null`, `status='waiting'`) plus its `challenge_questions`, reusing `packages/core`'s existing `buildPool`/`pickRound`. Returns the round for the creator to play.
- `POST /:id/guess` — mirrors `/api/online/guess`, scoped to `challenge_id`.
- `POST /:id/finish` — mirrors `/api/online/finish`; on writing the second player's `challenge_scores` row, marks `status='completed'`, updates `rivalries`, and fires a push to whichever player isn't the one calling `finish` (their result is now ready).
- `POST /:id/send` — body `{ opponentUsername? }`, called once the creator has finished playing. With a username, resolves it to a `player_token`, sets `delivery_type='invite'`, `opponent_token`, `status='pending'`, and sends an immediate push. Without one, sets `delivery_type='link'` and returns a shareable URL (`https://www.321guess.com/challenge/:id` or the native deep-link equivalent) — no separate token needed, the challenge's own `id` is the link; `opponent_token`/`status` stay unset until someone opens it.
- `GET /:id` — fetches a challenge's round for display. If `opponent_token IS NULL` and the caller isn't the creator, atomically claims it (`UPDATE ... WHERE id = $1 AND opponent_token IS NULL RETURNING *`, setting `opponent_token` and `status='pending'`) before returning — first opener wins the race.
- `POST /random` — implements the queue-or-create logic described above.
- `GET /list?playerToken=` — returns incoming pending, outgoing waiting, and completed-with-rivalry-summary challenges for the hub screen.

Push delivery reuses the existing Expo push token flow (`push_tokens` table) via a small shared helper (extracted from whatever the current daily cron uses to send a push, so both call sites share one code path) — the only change is triggering it inline instead of from a cron.

## Account Linking

Supabase Auth (already the project's backend) handles Google, Apple, and email-magic-link sign-in natively — no custom OAuth code needed. `online_players.auth_user_id` (nullable) links a lightweight identity to a Supabase Auth user once the player opts in from a new **"Hesabını Bağla"** section on the native Settings screen.

Recovery flow: signing in with the same linked provider on a new device looks up `online_players` by `auth_user_id` and restores that `player_token` + `username` (and therefore all history/rivalries) instead of generating a fresh identity.

## Edge Cases

- **Concurrent claim of the same link or random-queue entry**: handled by `FOR UPDATE SKIP LOCKED` (queue matching) and a conditional `UPDATE ... WHERE opponent_token IS NULL` (link claiming) — whoever's request lands first in Postgres wins; the loser (extremely rare, only under near-simultaneous requests) gets a normal "already claimed" error and falls through to creating their own challenge.
- **Player tries to match against their own waiting random challenge**: excluded via `creator_token <> me` in the queue query.
- **Expired, unplayed challenge**: filtered out of active queries by `expires_at > now()`; no separate cleanup job needed for v1.
- **Push notification permission denied**: the in-app hub's `GET /list` result is the source of truth regardless of push; push is a convenience, not the only delivery path.

## Testing

New pure-function unit tests in `apps/api/lib/` (matching the existing `daily-round.test.ts`, `color-extract.test.ts` pattern):
- Random-queue matching query logic (given a set of waiting rows, picks the right one / correctly finds none)
- Rivalry record update logic (canonical `player_a_token < player_b_token` ordering, win/loss/tie increments)
- 7-day expiration filtering

No changes needed to `packages/core` — round generation (`buildPool`, `pickRound`) is reused as-is.
