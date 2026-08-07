import { buildPool, pickClubClubRoundFromClubs } from "./game";
import { loadServerDataset } from "./server-dataset";
import type { Club, Settings } from "./types";

export const QUESTIONS_PER_ROUND = 5;

// Online mode draws only from clubs anyone would recognize on sight, not the
// broader "easy" band local mode uses (~25% of enabled leagues, still ~90
// clubs including e.g. Valencia, Mainz, Twente — whose shared-player lists
// skew toward domestic squad players a casual visitor won't know). Checked
// against the real dataset: these 12 clubs cover all 66 possible pairs with
// at least one shared player, and the shared lists lean toward genuinely
// famous transfers (Figo, Ronaldo, Eto'o, Pirlo, Cassano, ...).
const ONLINE_TOP_CLUBS = 12;

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

/** Deterministic set of `count` distinct club×club matchups for a date —
 * same date always yields the same ordered set of questions for every
 * player. Reuses the pool-building engine the local game uses (lib/game.ts)
 * so online mode never reimplements dataset filtering, but picks pairs from
 * ONLINE_TOP_CLUBS rather than local mode's percentage-based "easy" band. */
export async function pickDailyQuestions(roundDate: string, count: number): Promise<DailyMatchup[]> {
  const dataset = await loadServerDataset();
  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: dataset.leagues.map((l) => l.id),
    excludedCountries: [],
  };
  const pool = buildPool(dataset, settings);
  const eligibleClubs = [...pool.clubs].sort((a, b) => b.popularity - a.popularity).slice(0, ONLINE_TOP_CLUBS);

  const questions: DailyMatchup[] = [];
  const usedPairs = new Set<string>();
  const maxAttempts = count * 20;
  for (let attempt = 0; questions.length < count && attempt < maxAttempts; attempt++) {
    const seed = dateSeed(`${roundDate}#${attempt}`);
    const round = pickClubClubRoundFromClubs(pool, eligibleClubs, seed);
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
