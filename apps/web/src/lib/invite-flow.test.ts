import { describe, expect, it } from "vitest";
import { phaseAfterJoin, shouldTryJoinOnOpen } from "./invite-flow";

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
