import { buildPool, pickClubClubRound } from "./game";
import { loadServerDataset } from "./server-dataset";
import type { Club, Settings } from "./types";

export function todayRoundDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// FNV-1a string hash — deterministic seed so every player gets the same
// matchup on a given date, mirroring the seeded-RNG determinism already
// covered by lib/game.test.ts.
function dateSeed(dateStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type DailyMatchup = {
  clubA: Club;
  clubB: Club;
  /** Local-snapshot answer ids, used only if the live Wikidata fetch fails. */
  fallbackAnswerPlayerIds: string[];
};

/** Deterministic "easy" club×club pairing for a date, reusing the exact
 * pool-building/round-picking engine the local game uses (lib/game.ts) so
 * online mode never reimplements matchup logic. */
export async function pickDailyMatchup(roundDate: string): Promise<DailyMatchup | null> {
  const dataset = await loadServerDataset();
  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: dataset.leagues.map((l) => l.id),
    excludedCountries: [],
  };
  const pool = buildPool(dataset, settings);
  const round = pickClubClubRound(pool, "easy", dateSeed(roundDate));
  if (!round || round.kind !== "clubClub") return null;
  return {
    clubA: round.clubA,
    clubB: round.clubB,
    fallbackAnswerPlayerIds: round.correctPlayers.map((p) => p.id),
  };
}
