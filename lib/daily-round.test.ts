import { describe, expect, it } from "vitest";
import { pickDailyMatchup } from "./daily-round";

describe("pickDailyMatchup", () => {
  it("is deterministic for a given date", async () => {
    const a = await pickDailyMatchup("2026-01-15");
    const b = await pickDailyMatchup("2026-01-15");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.clubA.id).toBe(b!.clubA.id);
    expect(a!.clubB.id).toBe(b!.clubB.id);
    expect(a!.clubA.id).not.toBe(a!.clubB.id);
  });

  it("returns players shared by both clubs as the fallback answer key", async () => {
    const matchup = await pickDailyMatchup("2026-01-15");
    expect(matchup).not.toBeNull();
    expect(matchup!.fallbackAnswerPlayerIds.length).toBeGreaterThan(0);
  });
});
