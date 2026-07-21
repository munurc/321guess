import type {
  Club,
  Country,
  Dataset,
  Difficulty,
  Player,
  Round,
  Settings,
} from "./types";

const MAX_ATTEMPTS = 40;

export type Pool = {
  clubs: Club[];
  clubById: Map<string, Club>;
  countries: Country[];
  countryByCode: Map<string, Country>;
  playersByClub: Map<string, Player[]>;
  playersByCountry: Map<string, Player[]>;
};

/**
 * Filter dataset down to what's allowed by the user's setup — pool clubs
 * exclude leagues the user unchecked and countries the user excluded.
 * The player pool is then restricted to players whose `clubIds` intersect
 * the pool clubs (rewriting `clubIds` to keep only pool ids for O(1) checks).
 */
export function buildPool(dataset: Dataset, settings: Settings): Pool {
  const allowedLeagues = new Set(settings.includedLeagues);
  // NOTE: excludedCountries applies ONLY to Country × Club mode (which flags
  // appear as the country-side of a question). It does NOT filter the club
  // pool — league checkboxes are the mechanism for excluding clubs.
  const clubs = dataset.clubs.filter((c) => allowedLeagues.has(c.leagueId));
  const clubIdSet = new Set(clubs.map((c) => c.id));
  const clubById = new Map(clubs.map((c) => [c.id, c] as const));

  const playersByClub = new Map<string, Player[]>();
  const playersByCountry = new Map<string, Player[]>();

  for (const p of dataset.players) {
    const clubsInPool = p.clubIds.filter((id) => clubIdSet.has(id));
    if (clubsInPool.length === 0) continue;
    const filtered: Player = { ...p, clubIds: clubsInPool };

    for (const clubId of clubsInPool) {
      const list = playersByClub.get(clubId);
      if (list) list.push(filtered);
      else playersByClub.set(clubId, [filtered]);
    }
    const byNat = playersByCountry.get(filtered.nationalityCode);
    if (byNat) byNat.push(filtered);
    else playersByCountry.set(filtered.nationalityCode, [filtered]);
  }

  const countryCodesInPool = new Set(clubs.map((c) => c.countryCode));
  for (const code of playersByCountry.keys()) countryCodesInPool.add(code);
  const countries = dataset.countries.filter((c) => countryCodesInPool.has(c.code));
  const countryByCode = new Map(countries.map((c) => [c.code, c] as const));

  return {
    clubs,
    clubById,
    countries,
    countryByCode,
    playersByClub,
    playersByCountry,
  };
}

// Mulberry32 — tiny seedable PRNG for deterministic tests.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickRandom = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

/**
 * Pool-relative popularity bands.
 *  - easy:   both clubs must be in the top 25% by sitelink count
 *  - medium: both clubs must be in the top 65%
 *  - hard:   both clubs must be in the bottom 50%
 * Bands are recomputed from the pool (not the whole dataset) so a user who
 * excludes all top leagues can still play with the clubs they picked.
 */
export function clubsForDifficulty(pool: Pool, difficulty: Difficulty): Club[] {
  const sorted = [...pool.clubs].sort((a, b) => b.popularity - a.popularity);
  if (sorted.length === 0) return [];
  const n = sorted.length;
  switch (difficulty) {
    case "easy":
      return sorted.slice(0, Math.max(2, Math.ceil(n * 0.25)));
    case "medium":
      return sorted.slice(0, Math.max(2, Math.ceil(n * 0.65)));
    case "hard":
      return sorted.slice(Math.floor(n * 0.5));
  }
}

export function pickClubClubRound(
  pool: Pool,
  difficulty: Difficulty = "medium",
  seed = Date.now(),
): Round | null {
  const eligible = clubsForDifficulty(pool, difficulty);
  if (eligible.length < 2) return null;
  const rng = makeRng(seed);

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const a = pickRandom(eligible, rng);
    const b = pickRandom(eligible, rng);
    if (a.id === b.id) continue;

    const playersA = pool.playersByClub.get(a.id) ?? [];
    const playersB = pool.playersByClub.get(b.id);
    if (!playersB || playersB.length === 0 || playersA.length === 0) continue;

    const bIds = new Set(playersB.map((p) => p.id));
    const shared = playersA.filter((p) => bIds.has(p.id));
    if (shared.length === 0) continue;

    return {
      kind: "clubClub",
      clubA: a,
      clubB: b,
      correctPlayers: shared.sort((x, y) => x.name.localeCompare(y.name)),
    };
  }
  return null;
}

export function pickCountryClubRound(
  pool: Pool,
  excludedCountries: Set<string> = new Set(),
  difficulty: Difficulty = "medium",
  seed = Date.now(),
): Round | null {
  const eligible = clubsForDifficulty(pool, difficulty);
  if (eligible.length === 0 || pool.countries.length === 0) return null;
  const rng = makeRng(seed);

  const candidateCountryCodes = [...pool.playersByCountry.keys()].filter(
    (code) => pool.countryByCode.has(code) && !excludedCountries.has(code),
  );
  if (candidateCountryCodes.length === 0) return null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const club = pickRandom(eligible, rng);
    const code = pickRandom(candidateCountryCodes, rng);
    const country = pool.countryByCode.get(code);
    if (!country) continue;

    const playersFromCountry = pool.playersByCountry.get(code) ?? [];
    const clubPlayerIds = new Set((pool.playersByClub.get(club.id) ?? []).map((p) => p.id));
    const matches = playersFromCountry.filter((p) => clubPlayerIds.has(p.id));
    if (matches.length === 0) continue;

    return {
      kind: "countryClub",
      country,
      club,
      correctPlayers: matches.sort((x, y) => x.name.localeCompare(y.name)),
    };
  }
  return null;
}

export function pickRound(
  pool: Pool,
  mode: Settings["mode"],
  excludedCountries: Set<string> = new Set(),
  difficulty: Difficulty = "medium",
  seed?: number,
): Round | null {
  return mode === "clubClub"
    ? pickClubClubRound(pool, difficulty, seed)
    : pickCountryClubRound(pool, excludedCountries, difficulty, seed);
}
