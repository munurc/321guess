import { describe, expect, it } from "vitest";
import { pickChallengeQuestions, QUESTIONS_PER_ROUND, RANDOM_LEAGUE_IDS } from "./challenge-round";
import type { Settings } from "@321guess/core";

const randomSettings: Settings = {
  mode: "clubClub",
  difficulty: "easy",
  includedLeagues: RANDOM_LEAGUE_IDS,
  excludedCountries: [],
};

describe("pickChallengeQuestions", () => {
  it("returns QUESTIONS_PER_ROUND distinct matchups for the fixed random settings", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    expect(matchups).toHaveLength(QUESTIONS_PER_ROUND);
    const pairKeys = matchups.map((m) => {
      if (m.round.kind !== "clubClub") throw new Error("expected clubClub");
      return [m.round.clubA.id, m.round.clubB.id].sort().join("|");
    });
    expect(new Set(pairKeys).size).toBe(QUESTIONS_PER_ROUND);
  });

  it("only uses clubs from the 7-league random pool", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    for (const m of matchups) {
      if (m.round.kind !== "clubClub") throw new Error("expected clubClub");
      expect(RANDOM_LEAGUE_IDS).toContain(m.round.clubA.leagueId);
      expect(RANDOM_LEAGUE_IDS).toContain(m.round.clubB.leagueId);
    }
  });

  it("respects an arbitrary caller-provided mode/difficulty/leagues (targeted-challenge path)", async () => {
    const settings: Settings = {
      mode: "countryClub",
      difficulty: "hard",
      includedLeagues: ["Q9448"], // Premier League only
      excludedCountries: [],
    };
    const matchups = await pickChallengeQuestions(settings, 3);
    expect(matchups.length).toBeGreaterThan(0);
    for (const m of matchups) expect(m.round.kind).toBe("countryClub");
  });

  it("every question has at least one correct answer", async () => {
    const matchups = await pickChallengeQuestions(randomSettings, QUESTIONS_PER_ROUND);
    for (const m of matchups) expect(m.round.correctPlayers.length).toBeGreaterThan(0);
  });
});
