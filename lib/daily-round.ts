import { buildPool, pickClubClubRound } from "./game";
import { loadServerDataset } from "./server-dataset";
import type { Club, Settings } from "./types";

export const QUESTIONS_PER_ROUND = 5;

export function todayRoundDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// FNV-1a string hash — deterministic seed so every player gets the same set
// of matchups on a given date, mirroring the seeded-RNG determinism already
// covered by lib/game.test.ts.
function dateSeed(seedInput: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedInput.length; i++) {
    h ^= seedInput.charCodeAt(i);
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

function pairKey(clubA: Club, clubB: Club): string {
  return [clubA.id, clubB.id].sort().join("|");
}

/** Deterministic set of `count` distinct "easy" club×club matchups for a
 * date — same date always yields the same ordered set of questions for
 * every player. Reuses the exact pool-building/round-picking engine the
 * local game uses (lib/game.ts) so online mode never reimplements matchup
 * logic; just draws repeatedly with per-attempt seeds until `count` distinct
 * club pairs are found. */
export async function pickDailyQuestions(roundDate: string, count: number): Promise<DailyMatchup[]> {
  const dataset = await loadServerDataset();
  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: dataset.leagues.map((l) => l.id),
    excludedCountries: [],
  };
  const pool = buildPool(dataset, settings);

  const questions: DailyMatchup[] = [];
  const usedPairs = new Set<string>();
  const maxAttempts = count * 20;
  for (let attempt = 0; questions.length < count && attempt < maxAttempts; attempt++) {
    const seed = dateSeed(`${roundDate}#${attempt}`);
    const round = pickClubClubRound(pool, "easy", seed);
    if (!round || round.kind !== "clubClub") continue;
    const key = pairKey(round.clubA, round.clubB);
    if (usedPairs.has(key)) continue;
    usedPairs.add(key);
    questions.push({
      clubA: round.clubA,
      clubB: round.clubB,
      fallbackAnswerPlayerIds: round.correctPlayers.map((p) => p.id),
    });
  }
  return questions;
}
