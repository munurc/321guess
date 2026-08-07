import { describe, expect, it } from "vitest";
import type { Dataset, Settings } from "./types";
import { buildPool, clubsForDifficulty, pickClubClubRound, pickCountryClubRound } from "./game";

const dataset: Dataset = {
  countries: [
    { code: "ES", nameEn: "Spain", nameTr: "İspanya", flagUrl: "http://x/es.svg" },
    { code: "FR", nameEn: "France", nameTr: "Fransa", flagUrl: "http://x/fr.svg" },
    { code: "BR", nameEn: "Brazil", nameTr: "Brezilya", flagUrl: "http://x/br.svg" },
    { code: "AR", nameEn: "Argentina", nameTr: "Arjantin", flagUrl: "http://x/ar.svg" },
    { code: "PT", nameEn: "Portugal", nameTr: "Portekiz", flagUrl: "http://x/pt.svg" },
  ],
  leagues: [
    { id: "L_ES", nameEn: "La Liga", nameTr: "La Liga", countryCode: "ES" },
    { id: "L_FR", nameEn: "Ligue 1", nameTr: "Ligue 1", countryCode: "FR" },
    { id: "L_BR", nameEn: "Brasileirão", nameTr: "Brasileirão", countryCode: "BR" },
  ],
  clubs: [
    { id: "C_BAR",  name: "Barcelona",  logoUrl: "", leagueId: "L_ES", countryCode: "ES", popularity: 150 },
    { id: "C_RM",   name: "Real Madrid", logoUrl: "", leagueId: "L_ES", countryCode: "ES", popularity: 145 },
    { id: "C_PSG",  name: "PSG",        logoUrl: "", leagueId: "L_FR", countryCode: "FR", popularity: 90 },
    { id: "C_FLA",  name: "Flamengo",   logoUrl: "", leagueId: "L_BR", countryCode: "BR", popularity: 30 },
  ],
  players: [
    { id: "P_MESSI",    name: "Lionel Messi",     nationalityCode: "AR", clubIds: ["C_BAR", "C_PSG"] },
    { id: "P_NEYMAR",   name: "Neymar",           nationalityCode: "BR", clubIds: ["C_BAR", "C_PSG", "C_FLA"] },
    { id: "P_RONALDO",  name: "Cristiano Ronaldo", nationalityCode: "PT", clubIds: ["C_RM"] },
    { id: "P_LOCAL_BR", name: "Some Brazilian",   nationalityCode: "BR", clubIds: ["C_FLA"] },
  ],
};

const allLeagues = dataset.leagues.map((l) => l.id);

describe("buildPool", () => {
  it("filters clubs by included leagues", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: ["L_ES"],
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    expect(pool.clubs.map((c) => c.id).sort()).toEqual(["C_BAR", "C_RM"]);
  });

  it("does NOT filter clubs by excluded countries (that's a Country×Club-only concern)", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: ["BR"],
    };
    const pool = buildPool(dataset, settings);
    // Flamengo (Brazilian club) is still in the pool — country exclusion only
    // affects which flag can appear as a Country × Club question.
    expect(pool.clubs.find((c) => c.id === "C_FLA")).toBeDefined();
    expect(pool.clubs.length).toBe(4);
  });

  it("keeps a player only if at least one of their pool clubs remains", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: ["L_ES"], // only La Liga
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    const messiInPool = [...pool.playersByCountry.values()].flat().find((p) => p.id === "P_MESSI");
    expect(messiInPool?.clubIds).toEqual(["C_BAR"]);
    const localBr = [...pool.playersByCountry.values()].flat().find((p) => p.id === "P_LOCAL_BR");
    expect(localBr).toBeUndefined();
  });
});

describe("pickCountryClubRound with excluded countries", () => {
  it("never picks an excluded country as the flag side", () => {
    const settings: Settings = {
      mode: "countryClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: ["BR"], // Brazilian flag should not appear
    };
    const pool = buildPool(dataset, settings);
    const excluded = new Set(settings.excludedCountries);
    for (let s = 1; s < 200; s++) {
      const r = pickCountryClubRound(pool, excluded, "medium", s);
      if (!r || r.kind !== "countryClub") continue;
      expect(r.country.code).not.toBe("BR");
    }
  });
});

describe("pickClubClubRound", () => {
  it("finds shared players between two clubs", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // Force a Barcelona × PSG round by exhaustively searching seeds
    let found = false;
    for (let s = 1; s < 500; s++) {
      const r = pickClubClubRound(pool, "medium", s);
      if (!r || r.kind !== "clubClub") continue;
      const ids = [r.clubA.id, r.clubB.id].sort();
      if (ids[0] === "C_BAR" && ids[1] === "C_PSG") {
        expect(r.correctPlayers.map((p) => p.id).sort()).toEqual(["P_MESSI", "P_NEYMAR"]);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("returns null if pool has fewer than 2 clubs", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: ["L_BR"],
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    pool.clubs.pop(); // shrink to 0
    expect(pickClubClubRound(pool, "medium", 1)).toBeNull();
  });

  it("is deterministic under the same seed", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    const a = pickClubClubRound(pool, "medium", 42);
    const b = pickClubClubRound(pool, "medium", 42);
    expect(a).toEqual(b);
  });

  it("easy difficulty includes every club when each league has 8 or fewer clubs", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // Every league in this fixture has 1-2 clubs, so all qualify for "easy"
    // (top-8-per-league) — Barcelona × PSG (Messi + Neymar) should be reachable.
    let found = false;
    for (let s = 1; s < 500; s++) {
      const r = pickClubClubRound(pool, "easy", s);
      if (!r || r.kind !== "clubClub") continue;
      const ids = [r.clubA.id, r.clubB.id].sort();
      if (ids[0] === "C_BAR" && ids[1] === "C_PSG") {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("hard difficulty is empty when no league has more than 15 clubs", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // Every league here has far fewer than 16 clubs, so nothing ranks
    // 16th-or-lower within its own league — the "hard" band is empty.
    expect(pickClubClubRound(pool, "hard", 1)).toBeNull();
  });
});

describe("clubsForDifficulty (per-league bands)", () => {
  it("ranks clubs within their own league, not across the whole pool", () => {
    // League A: 3 clubs, all far more popular (by raw score) than every
    // club in League B. League B: 20 clubs with modest popularity.
    // A global percentile would let League A crowd out League B entirely;
    // per-league bands must still surface League B's own top 8.
    const leagueDataset: Dataset = {
      countries: [],
      leagues: [
        { id: "A", nameEn: "League A", nameTr: "Lig A", countryCode: "XX" },
        { id: "B", nameEn: "League B", nameTr: "Lig B", countryCode: "YY" },
      ],
      clubs: [
        { id: "A1", name: "A1", logoUrl: "", leagueId: "A", countryCode: "XX", popularity: 200 },
        { id: "A2", name: "A2", logoUrl: "", leagueId: "A", countryCode: "XX", popularity: 190 },
        { id: "A3", name: "A3", logoUrl: "", leagueId: "A", countryCode: "XX", popularity: 180 },
        ...Array.from({ length: 20 }, (_, i) => ({
          id: `B${i + 1}`,
          name: `B${i + 1}`,
          logoUrl: "",
          leagueId: "B",
          countryCode: "YY",
          popularity: 50 - i, // B1=50 (league's most popular) down to B20=31
        })),
      ],
      players: [],
    };
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: ["A", "B"],
      excludedCountries: [],
    };
    const pool = buildPool(leagueDataset, settings);

    const easy = clubsForDifficulty(pool, "easy").map((c) => c.id).sort();
    expect(easy).toEqual(["A1", "A2", "A3", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"].sort());

    const medium = clubsForDifficulty(pool, "medium").map((c) => c.id).sort();
    expect(medium.filter((id) => id.startsWith("B")).length).toBe(15); // B1..B15

    const hard = clubsForDifficulty(pool, "hard").map((c) => c.id).sort();
    expect(hard).toEqual(["B16", "B17", "B18", "B19", "B20"].sort()); // League A never reaches rank 16
  });
});

describe("pickCountryClubRound", () => {
  it("finds players with a given nationality who played for a given club", () => {
    const settings: Settings = {
      mode: "countryClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // Search seeds for BR × PSG match, should list Neymar
    let found = false;
    for (let s = 1; s < 500; s++) {
      const r = pickCountryClubRound(pool, new Set(), "medium", s);
      if (!r || r.kind !== "countryClub") continue;
      if (r.country.code === "BR" && r.club.id === "C_PSG") {
        expect(r.correctPlayers.map((p) => p.id)).toEqual(["P_NEYMAR"]);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
