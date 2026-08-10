-- 321guess online mode — Supabase schema.
-- Run this once in the Supabase SQL editor for your project.
-- All access happens through server-side API routes using the service-role
-- key, so RLS is enabled with no policies: only the service role bypasses it.

create extension if not exists pgcrypto;

create table if not exists online_players (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_lower text generated always as (lower(username)) stored,
  player_token uuid not null unique,
  created_at timestamptz not null default now(),
  unique (username_lower)
);

-- One row per day; the actual matchups live in daily_questions below.
create table if not exists daily_rounds (
  round_date date primary key,
  question_count integer not null,
  created_at timestamptz not null default now()
);

-- A day is a fixed set of club×club matchups (question_index 0..N-1), same
-- for every player — players can answer as many players as they want per
-- question, then pass/move on; nothing forces finding every shared player.
create table if not exists daily_questions (
  round_date date not null references daily_rounds(round_date),
  question_index integer not null,
  club_a_id text not null,
  club_a_name text not null,
  club_a_logo_url text not null,
  club_b_id text not null,
  club_b_name text not null,
  club_b_logo_url text not null,
  answer_player_ids text[] not null,
  primary key (round_date, question_index)
);

-- Server-recorded start time per (round, player) — the only source of truth
-- for how long a round took. A client-reported duration would let anyone
-- claim an arbitrarily fast finish and win the speed tie-break.
create table if not exists daily_starts (
  round_date date not null references daily_rounds(round_date),
  player_token uuid not null references online_players(player_token),
  started_at timestamptz not null default now(),
  primary key (round_date, player_token)
);

create table if not exists daily_guesses (
  round_date date not null references daily_rounds(round_date),
  question_index integer not null,
  player_token uuid not null references online_players(player_token),
  guessed_player_id text not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (round_date, question_index, player_token, guessed_player_id)
);

create table if not exists daily_scores (
  round_date date not null references daily_rounds(round_date),
  player_token uuid not null references online_players(player_token),
  username text not null,
  correct_count integer not null,
  total_possible integer not null,
  duration_ms integer not null,
  finished_at timestamptz not null default now(),
  primary key (round_date, player_token)
);

-- Today's leaderboard order: most correct first, ties broken by who finished faster.
create index if not exists daily_scores_leaderboard_idx
  on daily_scores (round_date, correct_count desc, duration_ms asc);

create table if not exists streaks (
  player_token uuid primary key references online_players(player_token),
  username text not null,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_played_date date,
  updated_at timestamptz not null default now()
);

create index if not exists streaks_longest_idx on streaks (longest_streak desc);

-- All-time "total known players" leaderboard — sums correct_count across
-- every day a player has finished, regardless of streaks/gaps.
create or replace view player_totals as
select
  player_token,
  username,
  sum(correct_count)::integer as total_correct,
  count(*)::integer as days_played
from daily_scores
group by player_token, username;

alter table online_players enable row level security;
alter table daily_rounds enable row level security;
alter table daily_questions enable row level security;
alter table daily_starts enable row level security;
alter table daily_guesses enable row level security;
alter table daily_scores enable row level security;
alter table streaks enable row level security;
