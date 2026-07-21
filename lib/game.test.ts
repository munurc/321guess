import { describe, expect, it } from "vitest";
import type { Dataset, Settings } from "./types";
import { buildPool, pickClubClubRound, pickCountryClubRound } from "./game";

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

  it("easy difficulty on a 4-club pool returns null (top 25% = only 1 club)", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // ceil(4 * 0.25) = 1 → but we floor at 2 → still 2 clubs (Barça + Real).
    // They don't share players → no valid round found within MAX_ATTEMPTS.
    expect(pickClubClubRound(pool, "easy", 1)).toBeNull();
  });

  it("hard difficulty restricts to the bottom-50% band", () => {
    const settings: Settings = {
      mode: "clubClub",
      difficulty: "medium",
      includedLeagues: allLeagues,
      excludedCountries: [],
    };
    const pool = buildPool(dataset, settings);
    // Bottom 50% = PSG (90) + Flamengo (30). Neymar played for both.
    let found = false;
    for (let s = 1; s < 300; s++) {
      const r = pickClubClubRound(pool, "hard", s);
      if (!r || r.kind !== "clubClub") continue;
      const hardIds = new Set(["C_PSG", "C_FLA"]);
      expect(hardIds.has(r.clubA.id)).toBe(true);
      expect(hardIds.has(r.clubB.id)).toBe(true);
      found = true;
      break;
    }
    expect(found).toBe(true);
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
