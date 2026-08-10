import { buildPool, pickClubClubRoundFromClubs } from "./game";
import { loadServerDataset } from "./server-dataset";
import type { Club, Settings } from "./types";

export const QUESTIONS_PER_ROUND = 5;

// Online mode draws only from clubs anyone would recognize on sight, not the
// broader "easy" band local mode uses (~25% of enabled leagues, still ~90
// clubs including e.g. Valencia, Mainz, Twente — whose shared-player lists
// skew toward domestic squad players a casual visitor won't know). Curated
// and data-verified pairwise (171 of the 171 possible pairs share at least
// one recognizable player) against sortitoutsi-caliber giants across the
// top 5 leagues plus Turkey/Portugal/Netherlands, deliberately excluding
// lower-profile leagues (Belgian Pro League, Saudi league, Brasileirão,
// Argentine Primera, MLS) whose fame doesn't travel as far.
const ONLINE_CLUB_IDS = new Set([
  "Q7156", // FC Barcelona
  "Q8682", // Real Madrid
  "Q18656", // Manchester United
  "Q1130849", // Liverpool
  "Q1422", // Juventus
  "Q9616", // Chelsea
  "Q9617", // Arsenal
  "Q15789", // Bayern Munich
  "Q1543", // AC Milan
  "Q631", // Inter Milan
  "Q50602", // Manchester City
  "Q2641", // Napoli
  "Q41420", // Borussia Dortmund
  "Q81888", // Ajax
  "Q128446", // Porto
  "Q131499", // Benfica
  "Q483020", // Paris Saint-Germain
  "Q495299", // Galatasaray
  "Q6601875", // Fenerbahçe
]);

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
 * ONLINE_CLUB_IDS rather than local mode's percentage-based "easy" band. */
export async function pickDailyQuestions(roundDate: string, count: number): Promise<DailyMatchup[]> {
  const dataset = await loadServerDataset();
  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: dataset.leagues.map((l) => l.id),
    excludedCountries: [],
  };
  const pool = buildPool(dataset, settings);
  const eligibleClubs = pool.clubs.filter((c) => ONLINE_CLUB_IDS.has(c.id));

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
