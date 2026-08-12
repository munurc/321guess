-- 321guess push notifications — additive migration, run after schema.sql in
-- the Supabase SQL editor. Does not alter any existing table.
--
-- Stores device push tokens (Expo push tokens, "ExponentPushToken[...]",
-- obtained client-side via expo-notifications) used for the daily
-- "today's challenge is ready" broadcast. player_token is
-- nullable: a device can opt into push before ever registering a username
-- in online mode. Same RLS convention as schema.sql — server-side
-- service-role access only.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  player_token uuid references online_players(player_token),
  platform text not null check (platform in ('ios', 'android')),
  device_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_token)
);

create index if not exists push_tokens_player_idx on push_tokens (player_token);

alter table push_tokens enable row level security;
