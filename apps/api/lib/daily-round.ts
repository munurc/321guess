import { buildPool, pickClubClubRoundFromClubs } from "@321guess/core";
import { createDailyRound, getDailyRound, type DailyRoundRow } from "./online-db";
import { loadServerDataset } from "./server-dataset";
import type { Club, Player, Settings } from "@321guess/core";

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

export class NoDailyMatchupsError extends Error {
  constructor() {
    super("no_matchups");
    this.name = "NoDailyMatchupsError";
  }
}

// Deliberately NOT derived from the incoming request (e.g. new URL(req.url))
// — that origin tracks the Host header, which can be attacker-controlled
// behind some proxy configs. Since this URL's response gets frozen as the
// entire day's answer key for every player, a spoofed origin would let an
// attacker poison the shared daily puzzle. INTERNAL_BASE_URL/VERCEL_URL are
// set by the platform, not by the request.
function getInternalOrigin(): string {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function fetchLiveAnswers(clubAId: string, clubBId: string, fallback: string[]): Promise<string[]> {
  try {
    const origin = getInternalOrigin();
    const res = await fetch(`${origin}/api/round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "clubClub", clubA: clubAId, clubB: clubBId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { players?: Player[] };
      if (Array.isArray(data.players) && data.players.length > 0) {
        return data.players.map((p) => p.id);
      }
    }
  } catch {
    // Wikidata unreachable — keep the local-dataset fallback list.
  }
  return fallback;
}

/**
 * Returns today's online-mode round, lazily generating it on first call:
 * QUESTIONS_PER_ROUND deterministic "easy" club×club matchups, each backed
 * by the same authoritative Wikidata answer source /api/round already uses
 * — falling back to the local dataset intersection per question if that
 * call fails. Safe to call concurrently (from a visitor's request or the
 * daily-notification cron) — createDailyRound() in lib/online-db.ts handles
 * the race.
 */
export async function ensureDailyRound(roundDate: string): Promise<DailyRoundRow> {
  const existing = await getDailyRound(roundDate);
  if (existing) return existing;

  const matchups = await pickDailyQuestions(roundDate, QUESTIONS_PER_ROUND);
  if (matchups.length === 0) throw new NoDailyMatchupsError();

  const questions = await Promise.all(
    matchups.map(async (m) => ({
      clubA: m.clubA,
      clubB: m.clubB,
      answerPlayerIds: await fetchLiveAnswers(m.clubA.id, m.clubB.id, m.fallbackAnswerPlayerIds),
    })),
  );

  return createDailyRound(roundDate, questions);
}
