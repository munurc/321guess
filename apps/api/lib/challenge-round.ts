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
