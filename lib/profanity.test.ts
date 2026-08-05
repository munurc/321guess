import { describe, expect, it } from "vitest";
import { containsBlockedWord, validateUsername } from "./profanity";

describe("validateUsername", () => {
  it("accepts a normal username", () => {
    expect(validateUsername("furkan_23")).toEqual({ valid: true });
  });

  it("accepts Turkish letters", () => {
    expect(validateUsername("şükrü_gol")).toEqual({ valid: true });
  });

  it("rejects usernames shorter than 3 chars", () => {
    expect(validateUsername("ab")).toEqual({ valid: false, reason: "format" });
  });

  it("rejects usernames starting with a digit", () => {
    expect(validateUsername("1player")).toEqual({ valid: false, reason: "format" });
  });

  it("rejects consecutive underscores", () => {
    expect(validateUsername("a__b")).toEqual({ valid: false, reason: "format" });
  });

  it("rejects a blocked word", () => {
    expect(validateUsername("fuckboy")).toEqual({ valid: false, reason: "blocked" });
  });

  it("rejects reserved/impersonation handles", () => {
    expect(validateUsername("admin")).toEqual({ valid: false, reason: "blocked" });
  });

  it("catches leetspeak evasions", () => {
    expect(containsBlockedWord("fu4k")).toBe(false); // not a real substitution for this word
    expect(containsBlockedWord("sh1t")).toBe(true);
    expect(containsBlockedWord("@dmin")).toBe(true);
  });

  it("catches diacritic-stripped evasions", () => {
    expect(containsBlockedWord("şerefsiz")).toBe(true);
    expect(containsBlockedWord("serefsiz")).toBe(true);
  });
});
