import { describe, expect, it } from "vitest";
import { applyResult, canonicalPair } from "./rivalry";

describe("canonicalPair", () => {
  it("returns tokens in ascending order regardless of input order", () => {
    expect(canonicalPair("b-token", "a-token")).toEqual(["a-token", "b-token"]);
    expect(canonicalPair("a-token", "b-token")).toEqual(["a-token", "b-token"]);
  });
});

describe("applyResult", () => {
  const zero = { playerAWins: 0, playerBWins: 0, ties: 0 };

  it("increments playerAWins when player A's token is the winner", () => {
    const result = applyResult(zero, "a-token", "b-token", "a-token");
    expect(result).toEqual({ playerAWins: 1, playerBWins: 0, ties: 0 });
  });

  it("increments playerBWins when player B's token is the winner", () => {
    const result = applyResult(zero, "a-token", "b-token", "b-token");
    expect(result).toEqual({ playerAWins: 0, playerBWins: 1, ties: 0 });
  });

  it("increments ties when winnerToken is null", () => {
    const result = applyResult(zero, "a-token", "b-token", null);
    expect(result).toEqual({ playerAWins: 0, playerBWins: 0, ties: 1 });
  });

  it("accumulates onto existing non-zero totals", () => {
    const current = { playerAWins: 3, playerBWins: 1, ties: 2 };
    const result = applyResult(current, "a-token", "b-token", "a-token");
    expect(result).toEqual({ playerAWins: 4, playerBWins: 1, ties: 2 });
  });
});
