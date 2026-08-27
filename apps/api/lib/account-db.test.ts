import { describe, expect, it } from "vitest";
import { isValidVerifiedUser } from "./account-db";

describe("isValidVerifiedUser", () => {
  it("accepts an object with a non-empty string id", () => {
    expect(isValidVerifiedUser({ id: "abc-123" })).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidVerifiedUser(null)).toBe(false);
  });

  it("rejects an object with a missing id", () => {
    expect(isValidVerifiedUser({})).toBe(false);
  });

  it("rejects an object with a non-string id", () => {
    expect(isValidVerifiedUser({ id: 123 })).toBe(false);
  });

  it("rejects an object with an empty-string id", () => {
    expect(isValidVerifiedUser({ id: "" })).toBe(false);
  });
});
