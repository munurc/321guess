import { describe, expect, it } from "vitest";
import { isExpired, isMatchableRandomChallenge } from "./challenge-eligibility";

describe("isExpired", () => {
  it("is false when expiresAt is in the future", () => {
    expect(isExpired("2026-01-10T00:00:00Z", new Date("2026-01-05T00:00:00Z"))).toBe(false);
  });

  it("is true when expiresAt is in the past", () => {
    expect(isExpired("2026-01-01T00:00:00Z", new Date("2026-01-05T00:00:00Z"))).toBe(true);
  });
});

describe("isMatchableRandomChallenge", () => {
  const now = new Date("2026-01-05T00:00:00Z");
  const base = {
    id: "c1",
    creatorToken: "creator-token",
    opponentToken: null,
    deliveryType: "random",
    status: "waiting",
    expiresAt: "2026-01-10T00:00:00Z",
  };

  it("is matchable when random, unclaimed, waiting, not expired, and requester isn't the creator", () => {
    expect(isMatchableRandomChallenge(base, "other-token", now)).toBe(true);
  });

  it("is not matchable when the requester is the creator", () => {
    expect(isMatchableRandomChallenge(base, "creator-token", now)).toBe(false);
  });

  it("is not matchable when already claimed", () => {
    expect(isMatchableRandomChallenge({ ...base, opponentToken: "someone" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when delivery type isn't random", () => {
    expect(isMatchableRandomChallenge({ ...base, deliveryType: "link" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when status isn't waiting", () => {
    expect(isMatchableRandomChallenge({ ...base, status: "completed" }, "other-token", now)).toBe(false);
  });

  it("is not matchable when expired", () => {
    expect(isMatchableRandomChallenge({ ...base, expiresAt: "2026-01-01T00:00:00Z" }, "other-token", now)).toBe(false);
  });
});
