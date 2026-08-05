import { describe, expect, it } from "vitest";
import { pickDailyQuestions } from "./daily-round";

describe("pickDailyQuestions", () => {
  it("is deterministic for a given date", async () => {
    const a = await pickDailyQuestions("2026-01-15", 5);
    const b = await pickDailyQuestions("2026-01-15", 5);
    expect(a.map((q) => [q.clubA.id, q.clubB.id])).toEqual(b.map((q) => [q.clubA.id, q.clubB.id]));
  });

  it("returns the requested number of distinct matchups", async () => {
    const questions = await pickDailyQuestions("2026-01-15", 5);
    expect(questions).toHaveLength(5);
    const pairKeys = questions.map((q) => [q.clubA.id, q.clubB.id].sort().join("|"));
    expect(new Set(pairKeys).size).toBe(5);
  });

  it("returns players shared by both clubs as the fallback answer key for each question", async () => {
    const questions = await pickDailyQuestions("2026-01-15", 5);
    for (const q of questions) {
      expect(q.fallbackAnswerPlayerIds.length).toBeGreaterThan(0);
    }
  });
});
