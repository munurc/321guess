-- Multi-player challenge invite links — additive-only migration, run after
-- challenges.sql (and club_colors.sql) in the Supabase SQL editor. Safe to
-- re-run: every statement is `if not exists`.
--
-- A link is a template pointing at the creator's finished "source"
-- challenge. Each person who joins gets their own 1-to-1 clone in
-- `challenges` (link_code set), so guess/finish/rivalry code is unchanged.
-- Same RLS convention as schema.sql: RLS on, no policies, service-role-only
-- access via apps/api.

create table if not exists challenge_links (
  code text primary key,
  source_challenge_id uuid not null references challenges(id),
  creator_token uuid not null references online_players(player_token),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz
);

create index if not exists challenge_links_creator_idx on challenge_links (creator_token);
create index if not exists challenge_links_source_idx on challenge_links (source_challenge_id);

alter table challenges add column if not exists link_code text references challenge_links(code);

-- One clone per (link, joiner): a double tap or a re-open can never create a
-- second attempt at the same link.
create unique index if not exists challenges_link_joiner_idx
  on challenges (link_code, opponent_token)
  where link_code is not null;

alter table challenge_links enable row level security;
