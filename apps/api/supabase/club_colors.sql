-- Adds the club ring color to stored round/challenge questions, so a
-- cached daily round or challenge (created once, served many times) can
-- carry a club's color forward instead of losing it. Additive-only —
-- existing rows simply have these columns as null, and the app already
-- falls back to a neutral ring color for a missing value (see
-- apps/web/src/components/LogoTile.tsx).

alter table daily_questions add column if not exists club_a_color text;
alter table daily_questions add column if not exists club_b_color text;

alter table challenge_questions add column if not exists club_a_color text;
alter table challenge_questions add column if not exists club_b_color text;
