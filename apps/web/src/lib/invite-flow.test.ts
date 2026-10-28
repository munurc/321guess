import { describe, expect, it } from "vitest";
import { phaseAfterJoin, resumePoint, shouldTryJoinOnOpen } from "./invite-flow";

const invite = { code: "abcd2345", creatorUsername: "ali", creatorScore: { correctCount: 3, totalPossible: 9 }, mode: "clubClub", difficulty: "easy", playedCount: 2 };
const challenge = { id: "c1", status: "pending" } as never;

describe("shouldTryJoinOnOpen", () => {
  it("shows the invite for an active link", () => {
    expect(shouldTryJoinOnOpen({ status: "ok", data: { ...invite, active: true } }, null)).toBe("invite");
  });
  it("shows inactive for an unknown link", () => {
    expect(shouldTryJoinOnOpen({ status: "failed" }, { token: "t", username: "u" })).toBe("inactive");
  });
  it("tries to join a revoked link when this browser has an identity (may have played already)", () => {
    expect(shouldTryJoinOnOpen({ status: "ok", data: { ...invite, active: false } }, { token: "t", username: "u" })).toBe("rejoin");
  });
  it("shows inactive for a revoked link without an identity", () => {
    expect(shouldTryJoinOnOpen({ status: "ok", data: { ...invite, active: false } }, null)).toBe("inactive");
  });
});

describe("phaseAfterJoin", () => {
  it("routes a fresh clone to the countdown", () => {
    expect(phaseAfterJoin({ status: "ok", data: challenge })).toEqual({ kind: "countdown", challenge });
  });
  it("routes an already-played clone to the result", () => {
    const done = { id: "c1", status: "completed" } as never;
    expect(phaseAfterJoin({ status: "ok", data: done })).toEqual({ kind: "load-result", challenge: done });
  });
  it("routes a revoked/expired link to inactive", () => {
    expect(phaseAfterJoin({ status: "gone" })).toEqual({ kind: "inactive" });
  });
  it("routes the creator's own link to the own screen", () => {
    expect(phaseAfterJoin({ status: "own" })).toEqual({ kind: "own" });
  });
  it("routes an unknown/stale identity to username entry with the expired message", () => {
    expect(phaseAfterJoin({ status: "expired" })).toEqual({ kind: "username", error: "expired" });
  });
  it("surfaces network/server failures as a retryable error", () => {
    expect(phaseAfterJoin({ status: "failed" })).toEqual({ kind: "error" });
  });
});

describe("shouldTryJoinOnOpen — own link", () => {
  it("sends the creator straight to the own-link screen instead of 'X challenged you'", () => {
    expect(shouldTryJoinOnOpen({ status: "ok", data: { ...invite, active: true } }, { token: "t", username: "ali" })).toBe("own");
  });
  it("still shows the invite to a different player", () => {
    expect(shouldTryJoinOnOpen({ status: "ok", data: { ...invite, active: true } }, { token: "t", username: "veli" })).toBe("invite");
  });
});

describe("resumePoint", () => {
  it("starts a fresh copy at question 1 with no chips", () => {
    expect(resumePoint([], 5)).toEqual({ questionIndex: 0, foundIds: [], wrongIds: [] });
  });
  it("resumes at the last question the player guessed on, restoring that question's chips", () => {
    const guesses = [
      { questionIndex: 0, playerId: "a", correct: true },
      { questionIndex: 2, playerId: "b", correct: true },
      { questionIndex: 2, playerId: "c", correct: false },
    ];
    expect(resumePoint(guesses, 5)).toEqual({ questionIndex: 2, foundIds: ["b"], wrongIds: ["c"] });
  });
  it("never points past the last question", () => {
    expect(resumePoint([{ questionIndex: 9, playerId: "a", correct: true }], 5).questionIndex).toBe(4);
  });
});
