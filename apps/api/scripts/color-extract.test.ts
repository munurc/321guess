import { describe, expect, it } from "vitest";
import { clampForRing, rgbToHex, rgbToHsl } from "./color-extract";

describe("rgbToHex", () => {
  it("formats pure red", () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
  });

  it("pads single-digit hex channels with a leading zero", () => {
    expect(rgbToHex({ r: 5, g: 0, b: 0 })).toBe("#050000");
  });
});

describe("clampForRing", () => {
  it("leaves an already-legible color (pure red) unchanged", () => {
    expect(clampForRing({ r: 255, g: 0, b: 0 })).toBe("#ff0000");
  });

  it("raises saturation for a near-gray color so it reads as a hue, not gray", () => {
    const grayish = { r: 140, g: 130, b: 135 }; // s ≈ 3.7%
    const before = rgbToHsl(grayish);
    const clamped = rgbToHsl(hexToRgb(clampForRing(grayish)));
    expect(before.s).toBeLessThan(0.1);
    expect(clamped.s).toBeGreaterThanOrEqual(0.35);
  });

  it("lightens a near-black color so it isn't invisible against a dark border", () => {
    const dark = { r: 10, g: 8, b: 12 }; // l ≈ 4%
    const clamped = rgbToHsl(hexToRgb(clampForRing(dark)));
    expect(clamped.l).toBeGreaterThanOrEqual(0.25);
  });

  it("darkens a near-white color so it doesn't disappear into the medallion card", () => {
    const light = { r: 250, g: 248, b: 252 }; // l ≈ 98%
    const clamped = rgbToHsl(hexToRgb(clampForRing(light)));
    expect(clamped.l).toBeLessThanOrEqual(0.6);
  });
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
