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
