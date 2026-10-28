import { describe, expect, it } from "vitest";
import { generateLinkCode, isLinkJoinable, linkUrl } from "./challenge-link";

describe("generateLinkCode", () => {
  it("generates 8-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) expect(generateLinkCode()).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
  });
});

describe("linkUrl", () => {
  it("builds the www link URL", () => {
    expect(linkUrl("abcd2345")).toBe("https://www.321guess.com/m/abcd2345");
  });
});

describe("isLinkJoinable", () => {
  const base = { creatorToken: "c", expiresAt: "2026-11-04T00:00:00Z", revokedAt: null };

  it("allows a different player before expiry", () => {
    expect(isLinkJoinable(base, "j", new Date("2026-11-01T00:00:00Z"))).toEqual({ ok: true });
  });

  it("rejects revoked first, even if also expired", () => {
    expect(
      isLinkJoinable({ ...base, revokedAt: "2026-10-30T00:00:00Z" }, "j", new Date("2026-12-01T00:00:00Z")),
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects after expiry", () => {
    expect(isLinkJoinable(base, "j", new Date("2026-11-05T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects the creator's own token", () => {
    expect(isLinkJoinable(base, "c", new Date("2026-11-01T00:00:00Z"))).toEqual({ ok: false, reason: "own_link" });
  });
});
