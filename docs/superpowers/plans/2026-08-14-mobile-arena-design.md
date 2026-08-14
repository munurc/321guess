# Mobile "Arena" Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/web`'s iOS/Android build a livelier, "app-native" visual identity (the "arena" palette — fixed dark forest-green chrome, amber/turquoise 3D-pressable buttons, circular team-colored logo medallions) while leaving the web build's look completely untouched.

**Architecture:** New NativeWind color tokens (plain literal hex, not CSS-var/theme-driven like the existing `paper`/`ink`/`accent` family, since arena is fixed regardless of device light/dark mode) live alongside the current tokens in `tailwind.config.js`. Shared components branch on `Platform.OS` to pick which token family and which visual treatment applies — one file, one component, platform-conditional className/props, never a `.web.tsx` fork. A new data-pipeline script adds a `color` field to club records (extracted from each club's existing logo), consumed by a redesigned `LogoTile` for the per-team ring color. A new mobile-only Settings screen centralizes language and sound/haptics toggles that used to be scattered across every screen's header.

**Tech Stack:** Expo Router, NativeWind v4 (Tailwind for React Native), `react-native-reanimated`/RN core `Animated`, `expo-haptics` (new), `expo-audio` (new), `sharp` (new, apps/api only) for logo color extraction.

## Global Constraints

- Web's rendered output must not change at all. Verified by `expo export -p web` producing the same route list/behavior throughout, and by never adding an arena class to a code path web can reach.
- No `.web.tsx` / native-only duplicate component files — platform divergence is `Platform.OS` branches inside shared components.
- Arena palette is fixed hex, exactly: `arena-bg #0F2A1E`, `arena-bg-soft #153A28`, `arena-card #F7F5F0`, `arena-accent #FFC738`, `arena-accent-strong #C99418`, `arena-accent-2 #2ECC8F`, `arena-accent-2-strong #1F9C6C`, `arena-text #F0FBF5`, `arena-text-soft #8FE8C4`.
- No existing player or club identity data (name, nationality, logoUrl, club membership) may be modified by the color-extraction script — it only adds a new field.
- Every new npm dependency this plan introduces must be added explicitly to the workspace `package.json` that uses it (never rely on an un-declared transitive/hoisted copy — this monorepo has broken on exactly that mistake multiple times already this session).
- `tsc --noEmit` (both `apps/web` and `apps/api`) and the full test suite (`npm test` from repo root) must stay green after every task.

---

## Task 1: Club color data pipeline

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `apps/api/scripts/color-extract.ts`
- Create: `apps/api/scripts/color-extract.test.ts`
- Create: `apps/api/scripts/extract-club-colors.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `Club.color?: string` (optional hex string, e.g. `"#ffb020"`) — consumed by Task 4's `LogoTile`.
- Produces: `clampForRing(rgb: { r: number; g: number; b: number }): string` and `rgbToHex(rgb): string` and `rgbToHsl(rgb): { h: number; s: number; l: number }`, exported from `apps/api/scripts/color-extract.ts` — pure, no I/O, fully unit-tested.
- Produces: `npm run extract-club-colors` script entry in `apps/api/package.json`, callable after `refetch-logos` in the fetch pipeline. Not run automatically by this plan (real network calls against ~thousands of logos) — running it is a manual step noted in Verification below, left to whoever refreshes the dataset next.

- [ ] **Step 1: Add the optional `color` field to `Club`**

Open `packages/core/src/types.ts` and change:

```typescript
export type Club = {
  id: string;
  name: string;
  logoUrl: string;
  leagueId: string;
  countryCode: string;
  /** Wikidata sitelink count — proxy for how famous the club is (higher = more famous). */
  popularity: number;
};
```

to:

```typescript
export type Club = {
  id: string;
  name: string;
  logoUrl: string;
  leagueId: string;
  countryCode: string;
  /** Wikidata sitelink count — proxy for how famous the club is (higher = more famous). */
  popularity: number;
  /** Hex ring color for the mobile "arena" logo medallion, extracted from
   * the club's own logo (see apps/api/scripts/extract-club-colors.ts).
   * Optional: older/not-yet-refreshed clubs.json snapshots won't have it,
   * and consumers must fall back to a neutral color rather than crash. */
  color?: string;
};
```

Optional (not required) is deliberate: it means no existing test fixture or `clubs.json` snapshot needs updating to keep compiling — this task should not need to touch `packages/core/src/game.test.ts` or `dataset.test.ts` at all.

- [ ] **Step 2: Run existing core tests to confirm nothing broke**

Run: `cd packages/core && npx vitest run`
Expected: all existing tests still pass (the field addition is additive/optional).

- [ ] **Step 3: Write the failing tests for the pure color math**

Create `apps/api/scripts/color-extract.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx vitest run scripts/color-extract.test.ts`
Expected: FAIL — `Cannot find module './color-extract'` (file doesn't exist yet).

- [ ] **Step 3: Implement the color math**

Create `apps/api/scripts/color-extract.ts`:

```typescript
export type RGB = { r: number; g: number; b: number };

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const MIN_SATURATION = 0.35;
const MIN_LIGHTNESS = 0.25;
const MAX_LIGHTNESS = 0.6;

/**
 * Clamps a color into a band that stays legible as a thin ring around the
 * near-white medallion card (arena-card, #F7F5F0): saturated enough to read
 * as a real hue rather than gray, and not so light it disappears into the
 * card nor so dark it loses its color identity.
 */
export function clampForRing(rgb: RGB): string {
  const hsl = rgbToHsl(rgb);
  const clamped = {
    h: hsl.h,
    s: Math.max(hsl.s, MIN_SATURATION),
    l: Math.min(Math.max(hsl.l, MIN_LIGHTNESS), MAX_LIGHTNESS),
  };
  return rgbToHex(hslToRgb(clamped));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx vitest run scripts/color-extract.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add `sharp` as an explicit apps/api dependency**

`sharp` is already resolvable today (a transitive dependency pulled in by Next.js, currently `^0.34.5` in the root lockfile) — but it is **not** declared in `apps/api/package.json`. This monorepo has broken multiple times this session on exactly this pattern (a package that resolves today only because something else happens to pull it in, then silently breaks on the next reinstall). Declare it explicitly.

Open `apps/api/package.json` and change:

```json
  "dependencies": {
    "@321guess/core": "*",
    "@supabase/supabase-js": "^2.45.4",
    "expo-server-sdk": "^7.1.0",
    "next": "^15.5.20",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

to:

```json
  "dependencies": {
    "@321guess/core": "*",
    "@supabase/supabase-js": "^2.45.4",
    "expo-server-sdk": "^7.1.0",
    "next": "^15.5.20",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sharp": "^0.34.5"
  },
```

Run `npm install` from the repo root afterward.

- [ ] **Step 6: Write the driver script**

Create `apps/api/scripts/extract-club-colors.ts`:

```typescript
/**
 * Computes each club's "arena" ring color from its existing logo image and
 * writes it into public/data/clubs.json as a new `color` field. Run after
 * refetch-logos in the fetch pipeline (needs a valid logoUrl to sample from).
 *
 * Downloads each logo, flattens it onto the medallion badge's own background
 * (so a transparent-PNG crest's edges average toward that, not black), takes
 * a 1×1 resize as a fast average color, then clamps it into a legible ring
 * band (see color-extract.ts). A club whose logo can't be fetched or decoded
 * keeps `color` unset — LogoTile falls back to a neutral arena accent for it.
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Club } from "@321guess/core";
import { clampForRing } from "./color-extract";

const UA = "321guess-color-extract/0.1 (https://github.com/munurcoskun/321guess)";
// arena-card — the medallion badge's own background.
const MEDALLION_BACKGROUND = { r: 247, g: 245, b: 240 };

async function extractColorForLogo(logoUrl: string): Promise<string | null> {
  const res = await fetch(logoUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const { data } = await sharp(buffer)
    .flatten({ background: MEDALLION_BACKGROUND })
    .resize(1, 1, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return clampForRing({ r: data[0], g: data[1], b: data[2] });
}

async function main() {
  const clubsPath = path.resolve(process.cwd(), "public/data/clubs.json");
  const clubs = JSON.parse(await fs.readFile(clubsPath, "utf8")) as Club[];

  console.log(`Extracting ring colors for ${clubs.length} clubs…`);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    try {
      const color = await extractColorForLogo(c.logoUrl);
      if (color) {
        c.color = color;
        updated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if ((i + 1) % 20 === 0 || i === clubs.length - 1) {
      console.log(`  ${i + 1}/${clubs.length}  updated:${updated}  failed:${failed}`);
    }
  }

  await fs.writeFile(clubsPath, JSON.stringify(clubs, null, 2));
  console.log(`\n✔ Wrote colors for ${updated} clubs; ${failed} left without a color`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 7: Register the npm script**

In `apps/api/package.json`'s `"scripts"`, change:

```json
    "refetch-logos": "tsx scripts/refetch-logos.ts",
```

to:

```json
    "refetch-logos": "tsx scripts/refetch-logos.ts",
    "extract-club-colors": "tsx scripts/extract-club-colors.ts",
```

- [ ] **Step 8: Verify the whole task compiles and tests pass**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass (the 6 new color-extract tests plus the existing `daily-round.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts apps/api/scripts/color-extract.ts apps/api/scripts/color-extract.test.ts apps/api/scripts/extract-club-colors.ts apps/api/package.json package-lock.json
git commit -m "Add club logo color extraction pipeline for mobile logo medallions"
```

Note: `npm run extract-club-colors` (from `apps/api/`) is **not** run as part of this plan — it makes a real network request per club against production `clubs.json`. Run it manually once, after this task lands, whenever convenient (it's idempotent and safe to re-run).

---

## Task 2: Arena design tokens + ArenaPressable

**Files:**
- Modify: `apps/web/tailwind.config.js`
- Create: `apps/web/src/lib/haptics.ts`
- Create: `apps/web/src/components/ArenaPressable.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: Tailwind classes `bg-arena-bg`, `bg-arena-bg-soft`, `bg-arena-card`, `bg-arena-accent`, `border-arena-accent-strong`, `bg-arena-accent-2`, `border-arena-accent-2-strong`, `text-arena-text`, `text-arena-text-soft` (and their `border-*`/`text-*` variants — Tailwind generates every utility for a configured color automatically). Consumed by every later screen-restyling task.
- Produces: `hapticTap(enabled: boolean): Promise<void>`, `hapticSuccess(enabled: boolean): Promise<void>`, `hapticError(enabled: boolean): Promise<void>` from `apps/web/src/lib/haptics.ts`. Consumed by `ArenaPressable` (tap) and Task 9 (success/error on guess result).
- Produces: `<ArenaPressable>` component — same prop surface as RN's `Pressable` (`onPress`, `disabled`, `className`, `children`, etc.) plus the press-scale animation and tap haptic built in. Consumed by every screen-restyling task (6 through 10) as a drop-in `Pressable` replacement for mobile action buttons.

- [ ] **Step 1: Add the arena tokens to Tailwind config**

Open `apps/web/tailwind.config.js`. The existing `paper`/`ink`/`accent` tokens route through CSS custom properties (`rgb(var(--paper) / <alpha-value>)`) because they follow the web theme's light/dark toggle. Arena tokens are **fixed** regardless of device theme, so they're plain literal hex — no CSS variable indirection needed. Change:

```javascript
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-2": "rgb(var(--paper-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-mute": "rgb(var(--ink-mute) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
      },
```

to:

```javascript
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-2": "rgb(var(--paper-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-mute": "rgb(var(--ink-mute) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
        // Mobile-only "arena" identity — fixed regardless of device
        // light/dark mode, so plain hex (not CSS-var-driven like the
        // tokens above). Never used on web; see
        // docs/superpowers/specs/2026-08-13-mobile-lively-design-design.md.
        "arena-bg": "#0F2A1E",
        "arena-bg-soft": "#153A28",
        "arena-card": "#F7F5F0",
        "arena-accent": "#FFC738",
        "arena-accent-strong": "#C99418",
        "arena-accent-2": "#2ECC8F",
        "arena-accent-2-strong": "#1F9C6C",
        "arena-text": "#F0FBF5",
        "arena-text-soft": "#8FE8C4",
      },
```

- [ ] **Step 2: Install expo-haptics**

Run: `cd apps/web && npx expo install expo-haptics`
Expected: adds a SDK-54-compatible version to `apps/web/package.json`'s dependencies.

Run `npm install` from the repo root afterward, then `npx expo-doctor` (from `apps/web/`) to confirm no duplicate-dependency warnings — this monorepo has hit that exact class of bug repeatedly this session.

- [ ] **Step 3: Write the haptics helper**

Create `apps/web/src/lib/haptics.ts`:

```typescript
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** No-ops on web and whenever the caller's `enabled` flag (the Settings
 * screen's haptics toggle) is off. Never throws — a failed haptic call
 * shouldn't interrupt the game. */
export async function hapticTap(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export async function hapticSuccess(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export async function hapticError(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
```

- [ ] **Step 4: Write ArenaPressable**

This task creates `ArenaPressable` reading a `hapticsEnabled` flag from `useGameSettings()` — that hook doesn't have this field yet (Task 3 adds it). To keep this task's deliverable buildable and testable on its own, `useGameSettings()` is called here with the field treated as already present; Task 3 lands before this file is ever imported by a screen, and both tasks touch `game-settings-context.tsx`'s shape, so order them as written (Task 2 before Task 3) only if you'd rather see the context change first — **this plan runs Task 3 immediately after Task 2 for exactly this reason; do not skip ahead.**

Create `apps/web/src/components/ArenaPressable.tsx`:

```tsx
import { useRef } from 'react';
import { Animated, Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { hapticTap } from '@/lib/haptics';
import { useGameSettings } from '@/lib/game-settings-context';

type ArenaPressableProps = PressableProps & { children: React.ReactNode };

/** Drop-in replacement for RN's Pressable: adds a spring press-down scale
 * and a light haptic tap on every press. The haptic is native-only and
 * respects the Settings screen's toggle; the scale animation runs on both
 * platforms (harmless, cheap) but web screens don't use this component. */
export function ArenaPressable({ onPress, disabled, children, ...rest }: ArenaPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { hapticsEnabled } = useGameSettings();

  function pressIn() {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function handlePress(e: GestureResponderEvent) {
    if (disabled) return;
    void hapticTap(hapticsEnabled);
    onPress?.(e);
  }

  return (
    <Animated.View className={rest.className as string | undefined} style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={handlePress} disabled={disabled} {...rest}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
```

This won't type-check yet (`useGameSettings()` doesn't return `hapticsEnabled` until Task 3) — that's expected and resolved in Task 3's Step. Do not run `tsc` as a pass/fail gate at the end of this task; Task 3 is the first point both files compile together.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tailwind.config.js apps/web/src/lib/haptics.ts apps/web/src/components/ArenaPressable.tsx apps/web/package.json package-lock.json
git commit -m "Add arena design tokens, haptics helper, and ArenaPressable"
```

---

## Task 3: Sound effects + settings state

**Files:**
- Modify: `apps/web/src/lib/game-settings-context.tsx`
- Create: `apps/web/src/lib/sound.ts`
- Create: `apps/web/assets/sounds/tap.mp3`, `apps/web/assets/sounds/correct.mp3`, `apps/web/assets/sounds/wrong.mp3`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: nothing from Task 1 or 2 directly, but completes the `useGameSettings()` shape `ArenaPressable` (Task 2) already assumes.
- Produces: `useGameSettings()` now returns `{ settings, setSettings, soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled }`. Consumed by `ArenaPressable` (Task 2, `hapticsEnabled`), the Settings screen (Task 5, all four new fields), and Task 9/10 (`soundEnabled` for guess feedback).
- Produces: `playSound(name: 'tap' | 'correct' | 'wrong', enabled: boolean): void` from `apps/web/src/lib/sound.ts`. Consumed by Task 9.

- [ ] **Step 1: Extend GameSettingsProvider**

`AppLocaleContext` (language) and the existing `settings` field (mode/difficulty/leagues) both hold session-only state today — no AsyncStorage persistence. Match that convention: sound/haptics toggles are also session-only, defaulting to on every app launch.

Open `apps/web/src/lib/game-settings-context.tsx` and replace its contents:

```typescript
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Settings } from "@321guess/core";

type GameSettingsContextValue = {
  settings: Settings | null;
  setSettings: (s: Settings) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
};

const GameSettingsContext = createContext<GameSettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  return (
    <GameSettingsContext.Provider
      value={{ settings, setSettings, soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled }}
    >
      {children}
    </GameSettingsContext.Provider>
  );
}

/** Produces: { settings, setSettings, soundEnabled, setSoundEnabled,
 * hapticsEnabled, setHapticsEnabled }. Consumed by SetupScreen (writes
 * settings), PlayScreen (reads settings), ArenaPressable (reads
 * hapticsEnabled), the Settings screen (reads/writes sound + haptics),
 * and OnlineScreen (reads soundEnabled for guess feedback). */
export function useGameSettings(): GameSettingsContextValue {
  const ctx = useContext(GameSettingsContext);
  if (!ctx) throw new Error("useGameSettings must be used within GameSettingsProvider");
  return ctx;
}
```

- [ ] **Step 2: Confirm ArenaPressable now compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `ArenaPressable.tsx` or `game-settings-context.tsx` (there will still be no *usages* of `ArenaPressable` yet — that's expected, later tasks add them).

- [ ] **Step 3: Install expo-audio**

Run: `cd apps/web && npx expo install expo-audio`

Run `npm install` from the repo root afterward, then `npx expo-doctor` (from `apps/web/`) to confirm no duplicate-dependency warnings.

- [ ] **Step 4: Generate the three sound effects**

These are short (<1s), generic game SFX — not licensed/sourced third-party assets, per the design spec. Generate them (tooling depends on what's available in your environment; any short, royalty-free "ui click", "success chime", "error buzz" sound works):

- `apps/web/assets/sounds/tap.mp3` — a soft, short UI click/tap sound (~100-150ms).
- `apps/web/assets/sounds/correct.mp3` — a short positive "ding"/chime (~300-500ms).
- `apps/web/assets/sounds/wrong.mp3` — a short, low "buzz"/negative tone (~300-500ms), not harsh.

- [ ] **Step 5: Verify the generated files**

Run (macOS): `afinfo apps/web/assets/sounds/tap.mp3 apps/web/assets/sounds/correct.mp3 apps/web/assets/sounds/wrong.mp3`
Expected: all three report a valid duration under 1 second and a playable audio format (mp3/AAC).

- [ ] **Step 6: Write the sound helper**

Create `apps/web/src/lib/sound.ts`:

```typescript
import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";

const SOURCES = {
  tap: require("../../assets/sounds/tap.mp3"),
  correct: require("../../assets/sounds/correct.mp3"),
  wrong: require("../../assets/sounds/wrong.mp3"),
} as const;

export type SoundName = keyof typeof SOURCES;

/** Fire-and-forget: creates a short-lived player, plays once, and releases
 * itself when done. No-ops on web and whenever `enabled` (the Settings
 * screen's sound toggle) is off. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled || Platform.OS === "web") return;
  const player = createAudioPlayer(SOURCES[name]);
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) {
      subscription.remove();
      player.remove();
    }
  });
  player.play();
}
```

If `expo-audio`'s installed version exposes a different player event name or removal API than `addListener("playbackStatusUpdate", ...)` / `player.remove()`, check `node_modules/expo-audio/build/*.d.ts` for the actual `AudioPlayer` interface and adjust this file to match — the shape above is expo-audio's documented API as of SDK 54 but point releases have shifted this kind of detail before in this exact monorepo (see the AsyncStorage `multiRemove`-vs-`removeMany` incident from the SDK 54 downgrade).

- [ ] **Step 7: Verify the whole task compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/game-settings-context.tsx apps/web/src/lib/sound.ts apps/web/assets/sounds apps/web/package.json package-lock.json
git commit -m "Add sound effects and sound/haptics settings state"
```

---

## Task 4: LogoTile circular medallion

**Files:**
- Modify: `apps/web/src/components/LogoTile.tsx`

**Interfaces:**
- Consumes: `Club.color?: string` (Task 1).
- Produces: `LogoTile` gains a new optional prop `color?: string`. Every existing caller keeps compiling unchanged (the prop is optional); Tasks 7 and 9 pass `color={club.color}` when rendering a club (never for flags/countries).

- [ ] **Step 1: Rewrite LogoTile**

Web keeps today's exact look (square tile, `rule`-bordered, `paper-2` background). Native gets a circular medallion: near-white badge (`arena-card`), thin ring in the club's own extracted color (falls back to the neutral `arena-accent-2` green when `color` is missing), soft neutral shadow — explicitly **not** the 3D bottom-border button treatment, since logo tiles aren't tappable (see the design spec's "Club logo tiles" section).

Replace the full contents of `apps/web/src/components/LogoTile.tsx`:

```tsx
import { Image, Platform, Text, View } from "react-native";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
  /** "lg" is the original reveal-screen size; "sm" fits inside a denser
   * layout (e.g. the online mode's in-progress question card). */
  size?: "lg" | "sm";
  /** Ring color for the native circular medallion. Ignored on web and for
   * flags (a flag already carries its own color). Falls back to a neutral
   * arena accent when a club has no extracted color yet. */
  color?: string;
};

const NEUTRAL_RING_COLOR = "#2ECC8F"; // arena-accent-2

export function LogoTile({ src, alt, caption, variant = "logo", size = "lg", color }: LogoTileProps) {
  const isSmall = size === "sm";

  if (Platform.OS !== "web" && variant === "logo") {
    const ringColor = color ?? NEUTRAL_RING_COLOR;
    return (
      <View className={`items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
        <View
          className={`aspect-square items-center justify-center rounded-full bg-arena-card ${
            isSmall ? "w-14 p-2" : "w-24 p-4"
          }`}
          style={{
            borderWidth: isSmall ? 1.5 : 2.5,
            borderColor: ringColor,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          }}
        >
          <Image
            source={{ uri: `${src}?width=400` }}
            accessibilityLabel={alt}
            resizeMode="contain"
            className="h-full w-full"
          />
        </View>
        <Text
          className={`text-center font-medium text-arena-text-soft ${
            isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
          }`}
        >
          {caption}
        </Text>
      </View>
    );
  }

  return (
    <View className={`items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
      <View
        className={`aspect-square items-center justify-center rounded-2xl border border-rule bg-paper-2 ${
          isSmall ? "w-14 p-2" : "w-40 p-6"
        } ${variant === "flag" ? "overflow-hidden p-0" : ""}`}
      >
        <Image
          source={{ uri: `${src}?width=400` }}
          accessibilityLabel={alt}
          resizeMode={variant === "flag" ? "cover" : "contain"}
          className="h-full w-full"
        />
      </View>
      <Text
        className={`text-center font-medium ${Platform.OS === "web" ? "text-ink-soft" : "text-arena-text-soft"} ${
          isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
        }`}
      >
        {caption}
      </Text>
    </View>
  );
}
```

Note the second branch (used for web always, and for native flags) still switches its caption text color by platform — a native flag tile keeps the square/bordered layout (flags don't get medallion treatment per the design spec) but should still read as "arena" text color, not web's `ink-soft`.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. (Existing callers in `RoundView.tsx` and `OnlineScreen.tsx` don't pass `color` yet — fine, it's optional.)

- [ ] **Step 3: Verify web export is unaffected**

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, same 6 routes as before. Web's `LogoTile` render path is unchanged (still the second branch, `Platform.OS === "web"` is always true there), so this is a safety check, not an expected-diff.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/LogoTile.tsx
git commit -m "Add circular team-colored medallion treatment to LogoTile on native"
```

---

## Task 5: Settings screen + locale fixes

**Files:**
- Create: `apps/web/src/components/SettingsScreen.tsx`
- Create: `apps/web/src/app/settings.tsx`
- Modify: `apps/web/src/locales/tr.json`
- Modify: `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `useGameSettings()`'s `soundEnabled`/`setSoundEnabled`/`hapticsEnabled`/`setHapticsEnabled` (Task 3), `useAppLocale()` (existing).
- Produces: route `/settings`, pushed to from Setup's gear icon in Task 6.

- [ ] **Step 1: Fix the `backToSetup` copy bug**

`apps/web/src/locales/tr.json`'s `play.backToSetup` is currently `"Ayarlara dön"` ("back to settings") — wrong today (it returns to Setup, not any settings screen) and now a direct name collision with the new Settings screen this task adds.

In `apps/web/src/locales/tr.json`, change:

```json
    "backToSetup": "Ayarlara dön",
```

to:

```json
    "backToSetup": "Ana ekrana dön",
```

(English's `"Back to setup"` in `en.json` has no such collision — leave it unchanged.)

- [ ] **Step 2: Add the `settings` locale section**

In `apps/web/src/locales/tr.json`, change:

```json
  "language": {
    "tr": "Türkçe",
    "en": "English"
  },
```

to:

```json
  "language": {
    "tr": "Türkçe",
    "en": "English"
  },
  "settings": {
    "title": "Ayarlar",
    "language": "Dil",
    "sound": "Ses efektleri",
    "haptics": "Titreşim",
    "back": "Ana ekran"
  },
```

In `apps/web/src/locales/en.json`, find the matching `"language": { "tr": "Turkish", "en": "English" },` block (or whatever its exact English strings are) and add the same `"settings"` key immediately after it, with:

```json
  "settings": {
    "title": "Settings",
    "language": "Language",
    "sound": "Sound effects",
    "haptics": "Haptics",
    "back": "Home"
  },
```

- [ ] **Step 3: Write the Settings screen**

Create `apps/web/src/components/SettingsScreen.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { useAppLocale } from '@/i18n/AppLocaleContext';
import { messages } from '@/i18n/messages';
import { useGameSettings } from '@/lib/game-settings-context';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const tLang = useTranslations('language');
  const router = useRouter();
  const { locale, setLocale } = useAppLocale();
  const { soundEnabled, setSoundEnabled, hapticsEnabled, setHapticsEnabled } = useGameSettings();
  const locales = Object.keys(messages) as (keyof typeof messages)[];

  return (
    <View className="flex-1 bg-arena-bg px-4 py-8">
      <Pressable onPress={() => router.back()}>
        <Text className="text-xs uppercase tracking-wider text-arena-text-soft">← {t('back')}</Text>
      </Pressable>

      <Text className="mt-6 text-2xl font-black text-arena-text">{t('title')}</Text>

      <View className="mt-8 gap-1">
        <SettingsRow label={t('language')}>
          <View className="flex-row gap-1 rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1">
            {locales.map((l) => (
              <Pressable
                key={l}
                onPress={() => setLocale(l)}
                className={`rounded-full px-3 py-1 ${locale === l ? 'bg-arena-accent' : ''}`}
              >
                <Text
                  className={locale === l ? 'text-xs font-semibold text-[#2A1E00]' : 'text-xs text-arena-text-soft'}
                >
                  {tLang(l)}
                </Text>
              </Pressable>
            ))}
          </View>
        </SettingsRow>

        <SettingsRow label={t('sound')}>
          <Toggle value={soundEnabled} onChange={setSoundEnabled} />
        </SettingsRow>

        <SettingsRow label={t('haptics')}>
          <Toggle value={hapticsEnabled} onChange={setHapticsEnabled} />
        </SettingsRow>
      </View>
    </View>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between border-b border-arena-bg-soft py-3">
      <Text className="text-sm font-semibold text-arena-text">{label}</Text>
      {children}
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      className={`h-6 w-10 justify-center rounded-full p-0.5 ${value ? 'bg-arena-accent-2' : 'bg-arena-bg-soft'}`}
    >
      <View className={`h-5 w-5 rounded-full bg-arena-card ${value ? 'self-end' : 'self-start'}`} />
    </Pressable>
  );
}
```

- [ ] **Step 4: Add the route**

Create `apps/web/src/app/settings.tsx`:

```tsx
import { SettingsScreen } from "@/components/SettingsScreen";

export default function Settings() {
  return <SettingsScreen />;
}
```

- [ ] **Step 5: Verify types and both JSON files parse**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. (`router.push("/settings")` doesn't exist anywhere yet — Task 6 adds it; Expo Router's typed routes regenerate on the next `expo start`, so if Task 6 is done in the same session this will already be picked up. If not, run `npx expo start` once to regenerate `.expo/types/router.d.ts` before Task 6.)

Run: `node -e "require('./apps/web/src/locales/tr.json'); require('./apps/web/src/locales/en.json'); console.log('ok')"`
Expected: prints `ok` (catches JSON syntax errors from the manual edits).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SettingsScreen.tsx apps/web/src/app/settings.tsx apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Add mobile Settings screen (language, sound, haptics) and fix backToSetup copy"
```

---

## Task 6: SetupScreen arena restyle

**Files:**
- Create: `apps/web/src/components/ScrollFadeBottom.tsx`
- Modify: `apps/web/src/components/SetupScreen.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `ArenaPressable` (Task 2), `/settings` route (Task 5).
- Produces: `<ScrollFadeBottom />` — a small absolutely-positioned bottom gradient, reused by Task 10.

- [ ] **Step 1: Install expo-linear-gradient**

Run: `cd apps/web && npx expo install expo-linear-gradient`

Run `npm install` from the repo root afterward, then `npx expo-doctor` (from `apps/web/`).

- [ ] **Step 2: Write the shared fade component**

Create `apps/web/src/components/ScrollFadeBottom.tsx`:

```tsx
import { LinearGradient } from 'expo-linear-gradient';

/** A ~40px bottom-edge gradient (transparent → arena-bg) laid over the
 * bottom of a scrollable region, signaling "more content below" without
 * relying on a bare scrollbar. Must be the last child of a `relative`
 * (or otherwise positioned) container the same size as the scroll area. */
export function ScrollFadeBottom() {
  return (
    <LinearGradient
      colors={['transparent', '#0F2A1E']}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 }}
    />
  );
}
```

- [ ] **Step 3: Restyle SetupScreen for native**

Web's render path must stay byte-for-byte identical — this task adds a second, fully separate return branch for native rather than threading `Platform.OS` conditionals through the existing JSX, so there is zero risk of an arena class leaking into the web output.

Replace the full contents of `apps/web/src/components/SetupScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { useGameSettings } from "../lib/game-settings-context";
import { ArenaPressable } from "./ArenaPressable";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ScrollFadeBottom } from "./ScrollFadeBottom";
import { ThemeToggle } from "./ThemeToggle";

export function SetupScreen() {
  const t = useTranslations("setup");
  const tManual = useTranslations("manual");
  const tOnline = useTranslations("online");
  const tSettings = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const { setSettings } = useGameSettings();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDataset().then((d) => {
      setDataset(d);
      setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
    });
  }, []);

  const clubCountries = useMemo(() => {
    if (!dataset) return [];
    const codes = new Set<string>();
    for (const p of dataset.players) codes.add(p.nationalityCode);
    return dataset.countries
      .filter((c) => codes.has(c.code))
      .sort((a, b) => {
        const an = locale === "tr" ? a.nameTr : a.nameEn;
        const bn = locale === "tr" ? b.nameTr : b.nameEn;
        return an.localeCompare(bn);
      });
  }, [dataset, locale]);

  const canStart = dataset !== null && includedLeagues.size > 0;

  function toggleLeague(id: string) {
    setIncludedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleCountry(code: string) {
    setExcludedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
  function selectAllLeagues() {
    if (dataset) setIncludedLeagues(new Set(dataset.leagues.map((l) => l.id)));
  }
  function clearAllLeagues() {
    setIncludedLeagues(new Set());
  }

  function start() {
    if (!canStart) return;
    setSettings({
      mode,
      difficulty,
      includedLeagues: [...includedLeagues],
      excludedCountries: [...excludedCountries],
    });
    router.push("/play");
  }

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="flex-row items-center justify-between px-4 pb-2 pt-8">
          <Text className="text-3xl font-black text-arena-text">
            <Text className="text-arena-accent">3·2·1</Text>guess
          </Text>
          <Pressable onPress={() => router.push("/settings")} accessibilityLabel={tSettings("title")}>
            <Text className="text-xl">⚙️</Text>
          </Pressable>
        </View>

        {!dataset ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-arena-text-soft">{t("loading")}</Text>
          </View>
        ) : (
          <>
            <View className="relative flex-1">
              <ScrollView className="flex-1 px-4" contentContainerClassName="gap-8 pb-10">
                <View>
                  <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                    {t("mode.heading")}
                  </Text>
                  <View className="gap-3">
                    <ArenaPressable
                      onPress={() => router.push("/online")}
                      className="flex-row items-center gap-4 rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent p-4"
                    >
                      <Text className="text-2xl">🏆</Text>
                      <View className="flex-1">
                        <Text className="font-semibold text-[#2A1E00]">{tOnline("modeCard.title")}</Text>
                        <Text className="mt-1 text-xs text-[#5C4300]">{tOnline("modeCard.description")}</Text>
                        <Text className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#2A1E00]">
                          ● {tOnline("modeCard.live")}
                        </Text>
                      </View>
                    </ArenaPressable>

                    <ArenaModeCard
                      selected={mode === "clubClub"}
                      onPress={() => setMode("clubClub")}
                      title={t("mode.clubClub.title")}
                      description={t("mode.clubClub.description")}
                      icon="🛡️"
                    />
                    <ArenaModeCard
                      selected={mode === "countryClub"}
                      onPress={() => setMode("countryClub")}
                      title={t("mode.countryClub.title")}
                      description={t("mode.countryClub.description")}
                      icon="🚩"
                    />

                    <ArenaPressable
                      onPress={() => router.push("/manual")}
                      className="flex-row items-center gap-4 rounded-2xl border-2 border-dashed border-arena-bg-soft p-4"
                    >
                      <Text className="text-2xl">🔍</Text>
                      <View className="flex-1">
                        <Text className="font-semibold text-arena-text">{tManual("title")}</Text>
                        <Text className="mt-1 text-xs text-arena-text-soft">{tManual("description")}</Text>
                      </View>
                    </ArenaPressable>
                  </View>
                </View>

                <View>
                  <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                    {t("difficulty.heading")}
                  </Text>
                  <View className="flex-row gap-2">
                    {(["easy", "medium", "hard"] as const).map((d) => (
                      <ArenaPressable
                        key={d}
                        onPress={() => setDifficulty(d)}
                        className={`flex-1 items-center rounded-xl border-2 px-3 py-3 ${
                          difficulty === d
                            ? "border-arena-accent-2 bg-arena-accent-2/15"
                            : "border-arena-bg-soft bg-arena-bg-soft"
                        }`}
                      >
                        <Text className="text-sm font-semibold text-arena-text">{t(`difficulty.${d}.title`)}</Text>
                        <Text className="mt-1 text-center text-[10px] text-arena-text-soft">
                          {t(`difficulty.${d}.description`)}
                        </Text>
                      </ArenaPressable>
                    ))}
                  </View>
                </View>

                <View>
                  <View className="mb-3 flex-row items-baseline justify-between">
                    <Text className="text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                      {t("leagues.heading")}
                    </Text>
                    <View className="flex-row gap-3">
                      <Pressable onPress={selectAllLeagues}>
                        <Text className="text-xs text-arena-accent-2">{t("leagues.selectAll")}</Text>
                      </Pressable>
                      <Pressable onPress={clearAllLeagues}>
                        <Text className="text-xs text-arena-text-soft">{t("leagues.clearAll")}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text className="mb-3 text-xs text-arena-text-soft">{t("leagues.hint")}</Text>
                  <View className="gap-2">
                    {dataset.leagues.map((l) => (
                      <ArenaChip
                        key={l.id}
                        checked={includedLeagues.has(l.id)}
                        onPress={() => toggleLeague(l.id)}
                        label={locale === "tr" ? l.nameTr : l.nameEn}
                      />
                    ))}
                  </View>
                </View>

                {mode === "countryClub" && (
                  <View>
                    <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                      {t("excludedCountries.heading")}
                    </Text>
                    <Text className="mb-3 text-xs text-arena-text-soft">{t("excludedCountries.hint")}</Text>
                    <View className="gap-2">
                      {clubCountries.map((c) => (
                        <ArenaChip
                          key={c.code}
                          checked={!excludedCountries.has(c.code)}
                          onPress={() => toggleCountry(c.code)}
                          label={locale === "tr" ? c.nameTr : c.nameEn}
                        />
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
              <ScrollFadeBottom />
            </View>

            <View className="border-t border-arena-bg-soft px-4 pb-6 pt-3">
              <ArenaPressable
                onPress={start}
                disabled={!canStart}
                className={`items-center rounded-2xl py-4 ${
                  canStart ? "border-b-4 border-arena-accent-strong bg-arena-accent" : "bg-arena-bg-soft"
                }`}
              >
                <Text className={`text-lg font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
                  {canStart ? t("start") : t("startDisabled")}
                </Text>
              </ArenaPressable>
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <Text className="text-3xl font-black">
          <Text className="text-accent">3·2·1</Text>guess
        </Text>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      {!dataset ? (
        <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
          <Text className="text-ink-mute">{t("loading")}</Text>
        </View>
      ) : (
        <View className="gap-8">
          <View>
            <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {t("mode.heading")}
            </Text>
            <View className="gap-3">
              <Pressable
                onPress={() => router.push("/online")}
                className="flex-row items-center gap-4 rounded-xl bg-accent p-4"
              >
                <Text className="text-2xl">🏆</Text>
                <View className="flex-1">
                  <Text className="font-semibold text-paper">{tOnline("modeCard.title")}</Text>
                  <Text className="mt-1 text-xs text-paper/80">{tOnline("modeCard.description")}</Text>
                  <Text className="mt-2 text-[10px] font-bold uppercase tracking-wider text-paper">
                    ● {tOnline("modeCard.live")}
                  </Text>
                </View>
              </Pressable>

              <ModeCard
                selected={mode === "clubClub"}
                onPress={() => setMode("clubClub")}
                title={t("mode.clubClub.title")}
                description={t("mode.clubClub.description")}
                icon="🛡️"
              />
              <ModeCard
                selected={mode === "countryClub"}
                onPress={() => setMode("countryClub")}
                title={t("mode.countryClub.title")}
                description={t("mode.countryClub.description")}
                icon="🚩"
              />
              <Pressable
                onPress={() => router.push("/manual")}
                className="flex-row items-center gap-4 rounded-xl border-2 border-dashed border-ink/20 p-4"
              >
                <Text className="text-2xl">🔍</Text>
                <View className="flex-1">
                  <Text className="font-semibold">{tManual("title")}</Text>
                  <Text className="mt-1 text-xs text-ink-mute">{tManual("description")}</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View>
            <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {t("difficulty.heading")}
            </Text>
            <View className="flex-row gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  className={`flex-1 items-center rounded-xl border-2 px-3 py-3 ${
                    difficulty === d ? "border-accent bg-accent/10" : "border-rule bg-ink/5"
                  }`}
                >
                  <Text className="text-sm font-semibold">{t(`difficulty.${d}.title`)}</Text>
                  <Text className="mt-1 text-center text-[10px] text-ink-mute">
                    {t(`difficulty.${d}.description`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                {t("leagues.heading")}
              </Text>
              <View className="flex-row gap-3">
                <Pressable onPress={selectAllLeagues}>
                  <Text className="text-xs text-accent">{t("leagues.selectAll")}</Text>
                </Pressable>
                <Pressable onPress={clearAllLeagues}>
                  <Text className="text-xs text-ink-mute">{t("leagues.clearAll")}</Text>
                </Pressable>
              </View>
            </View>
            <Text className="mb-3 text-xs text-ink-mute">{t("leagues.hint")}</Text>
            <View className="gap-2">
              {dataset.leagues.map((l) => (
                <Chip
                  key={l.id}
                  checked={includedLeagues.has(l.id)}
                  onPress={() => toggleLeague(l.id)}
                  label={locale === "tr" ? l.nameTr : l.nameEn}
                />
              ))}
            </View>
          </View>

          {mode === "countryClub" && (
            <View>
              <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                {t("excludedCountries.heading")}
              </Text>
              <Text className="mb-3 text-xs text-ink-mute">{t("excludedCountries.hint")}</Text>
              <View className="gap-2">
                {clubCountries.map((c) => (
                  <Chip
                    key={c.code}
                    checked={!excludedCountries.has(c.code)}
                    onPress={() => toggleCountry(c.code)}
                    label={locale === "tr" ? c.nameTr : c.nameEn}
                  />
                ))}
              </View>
            </View>
          )}

          <Pressable
            onPress={start}
            disabled={!canStart}
            className={`items-center rounded-xl py-4 ${canStart ? "bg-accent" : "bg-ink/10"}`}
          >
            <Text className={`text-lg font-bold ${canStart ? "text-paper" : "text-ink-mute"}`}>
              {canStart ? t("start") : t("startDisabled")}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function ArenaModeCard({
  selected,
  onPress,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <ArenaPressable
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-2xl border-2 p-4 ${
        selected ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-arena-text">{title}</Text>
        <Text className="mt-1 text-xs text-arena-text-soft">{description}</Text>
      </View>
    </ArenaPressable>
  );
}

function ArenaChip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <ArenaPressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
        checked ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className={checked ? "text-arena-accent-2" : "text-arena-text-soft"}>{checked ? "☑" : "☐"}</Text>
      <Text className={checked ? "text-arena-text" : "text-arena-text-soft"}>{label}</Text>
    </ArenaPressable>
  );
}

function ModeCard({
  selected,
  onPress,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-xl border-2 p-4 ${
        selected ? "border-accent bg-accent/10" : "border-rule bg-ink/5"
      }`}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold">{title}</Text>
        <Text className="mt-1 text-xs text-ink-mute">{description}</Text>
      </View>
    </Pressable>
  );
}

function Chip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
        checked ? "border-accent/50 bg-accent/10" : "border-rule bg-ink/5"
      }`}
    >
      <Text>{checked ? "☑" : "☐"}</Text>
      <Text className={checked ? "text-ink" : "text-ink-mute"}>{label}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Verify types and web export**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, same 6 routes. This is the important regression check — `expo export -p web` always evaluates with `Platform.OS === "web"`, so it only ever exercises the untouched second `return`.

- [ ] **Step 5: On-device check**

On the physical development build: Setup should open in the arena palette, the four mode entries should render as described, toggling difficulty/leagues should work exactly as before functionally, scrolling past ~3 leagues should show the bottom fade, and the "Başla" button should stay pinned while the list above it scrolls. Tapping ⚙️ should open the new Settings screen and back-navigate correctly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ScrollFadeBottom.tsx apps/web/src/components/SetupScreen.tsx apps/web/package.json package-lock.json
git commit -m "Restyle SetupScreen with the arena identity on native"
```

---

## Task 7: ManualScreen + RoundView arena restyle

**Files:**
- Modify: `apps/web/src/components/RoundView.tsx`
- Modify: `apps/web/src/components/ManualScreen.tsx`

**Interfaces:**
- Consumes: `LogoTile`'s `color` prop (Task 4), `ArenaPressable` (Task 2).
- Produces: nothing new — `RoundView` is also consumed as-is by Task 8 (`PlayScreen`), which needs no further changes to pick up this restyle.

`RoundView` is shared by `ManualScreen` and `PlayScreen` — restyling it once here means Task 8 doesn't touch it again.

- [ ] **Step 1: Restyle RoundView**

Replace the full contents of `apps/web/src/components/RoundView.tsx`:

```tsx
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Round } from "@321guess/core";
import { ArenaPressable } from "./ArenaPressable";
import { LogoTile } from "./LogoTile";

function codeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(base + code.charCodeAt(0), base + code.charCodeAt(1));
}

export function RoundView({ round, onNext }: { round: Round; onNext: () => void }) {
  const t = useTranslations("play");
  const locale = useLocale();
  const [revealed, setRevealed] = useState(false);

  if (Platform.OS !== "web") {
    return (
      <View className="items-center gap-8 px-4 py-8">
        <View className="flex-row items-center gap-6">
          {round.kind === "clubClub" ? (
            <>
              <LogoTile src={round.clubA.logoUrl} alt={round.clubA.name} caption={round.clubA.name} color={round.clubA.color} />
              <Text className="text-2xl font-black text-arena-text-soft">{t("vs")}</Text>
              <LogoTile src={round.clubB.logoUrl} alt={round.clubB.name} caption={round.clubB.name} color={round.clubB.color} />
            </>
          ) : (
            <>
              <LogoTile
                src={round.country.flagUrl}
                alt={locale === "tr" ? round.country.nameTr : round.country.nameEn}
                caption={locale === "tr" ? round.country.nameTr : round.country.nameEn}
                variant="flag"
              />
              <Text className="text-2xl font-black text-arena-text-soft">{t("vs")}</Text>
              <LogoTile src={round.club.logoUrl} alt={round.club.name} caption={round.club.name} color={round.club.color} />
            </>
          )}
        </View>

        <View className="w-full max-w-md gap-3">
          {!revealed ? (
            <ArenaPressable
              onPress={() => setRevealed(true)}
              className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-4"
            >
              <Text className="text-lg font-bold text-[#2A1E00]">{t("showAnswers")}</Text>
            </ArenaPressable>
          ) : (
            <>
              <View className="rounded-2xl bg-arena-bg-soft p-4">
                <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-arena-accent-2">
                  {t("answersHeading")} ({round.correctPlayers.length})
                </Text>
                {round.correctPlayers.length === 0 ? (
                  <Text className="text-sm text-arena-text-soft">{t("noAnswers")}</Text>
                ) : (
                  <View className="gap-1">
                    {round.correctPlayers.map((p) => (
                      <View key={p.id} className="flex-row items-center gap-2 rounded-md bg-arena-bg px-3 py-2">
                        <Text>{codeToFlag(p.nationalityCode)}</Text>
                        <Text className="flex-1 text-sm text-arena-text">{p.name}</Text>
                        <Text className="text-[10px] font-medium uppercase text-arena-text-soft">
                          {p.nationalityCode}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <ArenaPressable
                onPress={onNext}
                className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-4"
              >
                <Text className="text-lg font-bold text-[#2A1E00]">{t("nextRound")}</Text>
              </ArenaPressable>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="items-center gap-8 px-4 py-8">
      <View className="flex-row items-center gap-6">
        {round.kind === "clubClub" ? (
          <>
            <LogoTile src={round.clubA.logoUrl} alt={round.clubA.name} caption={round.clubA.name} />
            <Text className="text-2xl font-black text-ink-mute">{t("vs")}</Text>
            <LogoTile src={round.clubB.logoUrl} alt={round.clubB.name} caption={round.clubB.name} />
          </>
        ) : (
          <>
            <LogoTile
              src={round.country.flagUrl}
              alt={locale === "tr" ? round.country.nameTr : round.country.nameEn}
              caption={locale === "tr" ? round.country.nameTr : round.country.nameEn}
              variant="flag"
            />
            <Text className="text-2xl font-black text-ink-mute">{t("vs")}</Text>
            <LogoTile src={round.club.logoUrl} alt={round.club.name} caption={round.club.name} />
          </>
        )}
      </View>

      <View className="w-full max-w-md gap-3">
        {!revealed ? (
          <Pressable onPress={() => setRevealed(true)} className="items-center rounded-xl bg-accent py-4">
            <Text className="text-lg font-bold text-paper">{t("showAnswers")}</Text>
          </Pressable>
        ) : (
          <>
            <View className="rounded-xl border border-rule bg-ink/5 p-4">
              <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
                {t("answersHeading")} ({round.correctPlayers.length})
              </Text>
              {round.correctPlayers.length === 0 ? (
                <Text className="text-sm text-ink-mute">{t("noAnswers")}</Text>
              ) : (
                <View className="gap-1">
                  {round.correctPlayers.map((p) => (
                    <View key={p.id} className="flex-row items-center gap-2 rounded-md bg-paper px-3 py-2">
                      <Text>{codeToFlag(p.nationalityCode)}</Text>
                      <Text className="flex-1 text-sm">{p.name}</Text>
                      <Text className="text-[10px] font-medium uppercase text-ink-mute">
                        {p.nationalityCode}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Pressable onPress={onNext} className="items-center rounded-xl bg-accent py-4">
              <Text className="text-lg font-bold text-paper">{t("nextRound")}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Restyle ManualScreen and its SearchBox helper**

`SearchBox` keeps all of its existing state and filtering logic untouched — only its two render points (the "selected" card, and the input+dropdown) gain a native branch. A new optional `getMedallion` prop lets `ManualScreen` opt individual `SearchBox` instances into showing a `LogoTile` medallion (clubs only — the country `SearchBox` call never passes it, matching the design spec's "country flags stay neutral" rule).

Replace the full contents of `apps/web/src/components/ManualScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Club, Country, Dataset, GameMode, Round } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { fetchLiveRoundPlayers } from "../lib/live-players";
import { ArenaPressable } from "./ArenaPressable";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoTile } from "./LogoTile";
import { RoundView } from "./RoundView";
import { ThemeToggle } from "./ThemeToggle";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function ManualScreen() {
  const t = useTranslations("manual");
  const locale = useLocale();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [clubA, setClubA] = useState<Club | null>(null);
  const [clubB, setClubB] = useState<Club | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [round, setRound] = useState<Round | null>(null);

  useEffect(() => {
    loadDataset().then(setDataset);
  }, []);

  const countries = useMemo(() => {
    if (!dataset) return [];
    return [...dataset.countries].sort((a, b) => {
      const an = locale === "tr" ? a.nameTr : a.nameEn;
      const bn = locale === "tr" ? b.nameTr : b.nameEn;
      return an.localeCompare(bn);
    });
  }, [dataset, locale]);

  function reset() {
    setClubA(null);
    setClubB(null);
    setCountry(null);
    setRound(null);
  }

  function switchMode(next: GameMode) {
    setMode(next);
    reset();
  }

  function startRound() {
    if (!dataset) return;
    if (mode === "clubClub") {
      if (!clubA || !clubB || clubA.id === clubB.id) return;
      const localMatches = dataset.players.filter(
        (p) => p.clubIds.includes(clubA.id) && p.clubIds.includes(clubB.id),
      );
      const next: Round = { kind: "clubClub", clubA, clubB, correctPlayers: localMatches };
      setRound(next);
      fetchLiveRoundPlayers(next).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || current.kind !== "clubClub") return current;
          if (current.clubA.id !== next.clubA.id || current.clubB.id !== next.clubB.id) return current;
          return { ...current, correctPlayers: live };
        });
      });
    } else {
      if (!country || !clubA) return;
      const localMatches = dataset.players.filter(
        (p) => p.nationalityCode === country.code && p.clubIds.includes(clubA.id),
      );
      const next: Round = { kind: "countryClub", country, club: clubA, correctPlayers: localMatches };
      setRound(next);
      fetchLiveRoundPlayers(next).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || current.kind !== "countryClub") return current;
          if (current.country.code !== next.country.code || current.club.id !== next.club.id) return current;
          return { ...current, correctPlayers: live };
        });
      });
    }
  }

  const canStart =
    mode === "clubClub"
      ? clubA !== null && clubB !== null && clubA.id !== clubB.id
      : country !== null && clubA !== null;

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <ScrollView className="flex-1 px-4 py-8">
          <Text className="text-2xl font-black text-arena-accent">{t("title")}</Text>
          <Text className="mt-1 text-sm text-arena-text-soft">{t("description")}</Text>

          {!round ? (
            <>
              <View className="mb-6 mt-6 flex-row self-start rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1">
                {(["clubClub", "countryClub"] as const).map((m) => (
                  <ArenaPressable
                    key={m}
                    onPress={() => switchMode(m)}
                    className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-arena-accent" : ""}`}
                  >
                    <Text className={mode === m ? "font-semibold text-[#2A1E00]" : "text-arena-text-soft"}>
                      {t(`mode.${m}`)}
                    </Text>
                  </ArenaPressable>
                ))}
              </View>

              {!dataset ? (
                <View className="items-center rounded-2xl bg-arena-bg-soft p-8">
                  <Text className="text-arena-text-soft">…</Text>
                </View>
              ) : mode === "clubClub" ? (
                <View className="gap-4">
                  <SearchBox
                    label={t("search.clubA")}
                    selected={clubA}
                    onChange={setClubA}
                    items={dataset.clubs}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    getSubtitle={(c) => c.countryCode}
                    getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                    emptyText={t("search.empty")}
                  />
                  <SearchBox
                    label={t("search.clubB")}
                    selected={clubB}
                    onChange={setClubB}
                    items={dataset.clubs.filter((c) => clubA === null || c.id !== clubA.id)}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    getSubtitle={(c) => c.countryCode}
                    getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                    emptyText={t("search.empty")}
                  />
                </View>
              ) : (
                <View className="gap-4">
                  <SearchBox
                    label={t("search.country")}
                    selected={country}
                    onChange={setCountry}
                    items={countries}
                    getKey={(c) => c.code}
                    getLabel={(c) => (locale === "tr" ? c.nameTr : c.nameEn)}
                    getSubtitle={(c) => c.code}
                    emptyText={t("search.empty")}
                  />
                  <SearchBox
                    label={t("search.club")}
                    selected={clubA}
                    onChange={setClubA}
                    items={dataset.clubs}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    getSubtitle={(c) => c.countryCode}
                    getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                    emptyText={t("search.empty")}
                  />
                </View>
              )}

              <Text className="mt-4 text-xs text-arena-text-soft">{t("hint")}</Text>

              <View className="mt-8 flex-row gap-3">
                <ArenaPressable
                  onPress={startRound}
                  disabled={!canStart}
                  className={`flex-1 items-center rounded-2xl py-4 ${
                    canStart ? "border-b-4 border-arena-accent-strong bg-arena-accent" : "bg-arena-bg-soft"
                  }`}
                >
                  <Text className={`text-lg font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
                    {t("start")}
                  </Text>
                </ArenaPressable>
                {(clubA || clubB || country) && (
                  <ArenaPressable onPress={reset} className="justify-center rounded-2xl border border-arena-accent-2 px-4">
                    <Text className="text-sm text-arena-text-soft">{t("search.clear")}</Text>
                  </ArenaPressable>
                )}
              </View>
            </>
          ) : (
            <>
              <RoundView round={round} onNext={() => setRound(null)} />
              <ArenaPressable onPress={reset} className="mt-4 items-center">
                <Text className="text-xs uppercase tracking-wider text-arena-text-soft">{t("newRound")}</Text>
              </ArenaPressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <ThemeToggle />
        <LanguageSwitcher />
      </View>

      {!round ? (
        <>
          <Text className="text-2xl font-black text-accent">{t("title")}</Text>
          <Text className="mt-1 text-sm text-ink-mute">{t("description")}</Text>

          <View className="mb-6 mt-6 flex-row self-start rounded-full border border-rule bg-ink/5 p-1">
            {(["clubClub", "countryClub"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-accent" : ""}`}
              >
                <Text className={mode === m ? "font-semibold text-paper" : "text-ink-soft"}>
                  {t(`mode.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {!dataset ? (
            <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
              <Text className="text-ink-mute">…</Text>
            </View>
          ) : mode === "clubClub" ? (
            <View className="gap-4">
              <SearchBox
                label={t("search.clubA")}
                selected={clubA}
                onChange={setClubA}
                items={dataset.clubs}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
              <SearchBox
                label={t("search.clubB")}
                selected={clubB}
                onChange={setClubB}
                items={dataset.clubs.filter((c) => clubA === null || c.id !== clubA.id)}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
            </View>
          ) : (
            <View className="gap-4">
              <SearchBox
                label={t("search.country")}
                selected={country}
                onChange={setCountry}
                items={countries}
                getKey={(c) => c.code}
                getLabel={(c) => (locale === "tr" ? c.nameTr : c.nameEn)}
                getSubtitle={(c) => c.code}
                emptyText={t("search.empty")}
              />
              <SearchBox
                label={t("search.club")}
                selected={clubA}
                onChange={setClubA}
                items={dataset.clubs}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
            </View>
          )}

          <Text className="mt-4 text-xs text-ink-mute">{t("hint")}</Text>

          <View className="mt-8 flex-row gap-3">
            <Pressable
              onPress={startRound}
              disabled={!canStart}
              className={`flex-1 items-center rounded-xl py-4 ${canStart ? "bg-accent" : "bg-ink/10"}`}
            >
              <Text className={`text-lg font-bold ${canStart ? "text-paper" : "text-ink-mute"}`}>
                {t("start")}
              </Text>
            </Pressable>
            {(clubA || clubB || country) && (
              <Pressable onPress={reset} className="justify-center rounded-xl border border-rule px-4">
                <Text className="text-sm text-ink-soft">{t("search.clear")}</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <>
          <RoundView round={round} onNext={() => setRound(null)} />
          <Pressable onPress={reset} className="mt-4 items-center">
            <Text className="text-xs uppercase tracking-wider text-ink-mute">{t("newRound")}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

type SearchBoxProps<T> = {
  label: string;
  selected: T | null;
  onChange: (item: T | null) => void;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubtitle: (item: T) => string;
  /** Optional — only club-type SearchBox calls pass this. Renders a small
   * LogoTile medallion next to the selected item on native. Country
   * selections never pass it (a flag already carries its own color). */
  getMedallion?: (item: T) => { src: string; color?: string };
  emptyText: string;
};

function SearchBox<T>({
  label,
  selected,
  onChange,
  items,
  getKey,
  getLabel,
  getSubtitle,
  getMedallion,
  emptyText,
}: SearchBoxProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const isNative = Platform.OS !== "web";

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items.slice(0, 30);
    return items.filter((item) => normalize(getLabel(item)).includes(q)).slice(0, 40);
  }, [query, items, getLabel]);

  if (selected) {
    if (isNative) {
      const medallion = getMedallion?.(selected);
      return (
        <View className="flex-row items-center gap-3 rounded-2xl border-2 border-arena-accent-2 bg-arena-accent-2/15 p-3">
          {medallion && (
            <LogoTile size="sm" src={medallion.src} alt={getLabel(selected)} caption="" color={medallion.color} />
          )}
          <View className="flex-1">
            <Text className="mb-1 text-[10px] uppercase tracking-wider text-arena-text-soft">{label}</Text>
            <Text className="text-base font-semibold text-arena-text">{getLabel(selected)}</Text>
            <Text className="text-xs text-arena-text-soft">{getSubtitle(selected)}</Text>
          </View>
          <Pressable
            onPress={() => {
              onChange(null);
              setQuery("");
            }}
            className="rounded-md px-2 py-1"
          >
            <Text className="text-xs text-arena-text-soft">✕</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View className="rounded-xl border-2 border-accent bg-accent/10 p-3">
        <Text className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">{label}</Text>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-base font-semibold">{getLabel(selected)}</Text>
            <Text className="text-xs text-ink-mute">{getSubtitle(selected)}</Text>
          </View>
          <Pressable
            onPress={() => {
              onChange(null);
              setQuery("");
            }}
            className="rounded-md px-2 py-1"
          >
            <Text className="text-xs text-ink-mute">✕</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isNative) {
    // A dashed "+" circle echoes the medallion-slot metaphor from the
    // reveal screens even before anything is picked — only for club-type
    // calls (getMedallion is only ever passed for clubs, never countries),
    // matching the design spec's "unselected slot ... dashed-outline '+'
    // placeholder" requirement. The text input stays fully functional
    // alongside it — the circle is decorative, not a replacement control.
    return (
      <View className="flex-row items-center gap-3">
        {getMedallion && (
          <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-arena-accent-2">
            <Text className="text-lg text-arena-accent-2">+</Text>
          </View>
        )}
        <View className="relative flex-1">
          <Text className="mb-1 text-[10px] uppercase tracking-wider text-arena-text-soft">{label}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setOpen(true)}
            placeholder={label}
            placeholderTextColor="#8FE8C4"
            className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-3 text-base text-arena-text"
          />
          {open && (
            <View className="absolute top-16 z-20 max-h-72 w-full rounded-2xl border border-arena-accent-2 bg-arena-bg-soft">
              {filtered.length === 0 ? (
                <Text className="px-4 py-3 text-sm text-arena-text-soft">{emptyText}</Text>
              ) : (
                <ScrollView>
                  {filtered.map((item) => (
                    <Pressable
                      key={getKey(item)}
                      onPress={() => {
                        onChange(item);
                        setQuery("");
                        setOpen(false);
                      }}
                      className="flex-row items-center justify-between px-4 py-2"
                    >
                      <Text className="flex-1 text-arena-text">{getLabel(item)}</Text>
                      <Text className="text-xs text-arena-text-soft">{getSubtitle(item)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="relative">
      <Text className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">{label}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setOpen(true)}
        placeholder={label}
        className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
      />
      {open && (
        <View className="absolute top-16 z-20 max-h-72 w-full rounded-xl border border-rule bg-paper">
          {filtered.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-mute">{emptyText}</Text>
          ) : (
            <ScrollView>
              {filtered.map((item) => (
                <Pressable
                  key={getKey(item)}
                  onPress={() => {
                    onChange(item);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between px-4 py-2"
                >
                  <Text className="flex-1">{getLabel(item)}</Text>
                  <Text className="text-xs text-ink-mute">{getSubtitle(item)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3: Verify types and web export**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, same 6 routes.

- [ ] **Step 4: On-device check**

Manual mode: switching clubClub/countryClub pills, picking clubs (medallions should appear once selected, each ringed in that club's own color), starting a round should show `RoundView`'s arena-styled reveal flow.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/RoundView.tsx apps/web/src/components/ManualScreen.tsx
git commit -m "Restyle ManualScreen and RoundView with the arena identity on native"
```

---

## Task 8: PlayScreen + Countdown arena restyle

**Files:**
- Modify: `apps/web/src/components/PlayScreen.tsx`
- Modify: `apps/web/src/components/Countdown.tsx`

**Interfaces:**
- Consumes: `RoundView` (already arena-aware from Task 7) — this task needs no changes to `RoundView` itself.

- [ ] **Step 1: Restyle PlayScreen**

Replace the full contents of `apps/web/src/components/PlayScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslations } from "use-intl";
import type { Dataset, Round } from "@321guess/core";
import { buildPool, pickRound } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { fetchLiveRoundPlayers } from "../lib/live-players";
import { useGameSettings } from "../lib/game-settings-context";
import { Countdown } from "./Countdown";
import { RoundView } from "./RoundView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type Phase = "countdown" | "round";

function roundKey(round: Round): string {
  return round.kind === "clubClub"
    ? `cc-${round.clubA.id}-${round.clubB.id}`
    : `cn-${round.country.code}-${round.club.id}`;
}

export function PlayScreen() {
  const t = useTranslations("play");
  const router = useRouter();
  const { settings } = useGameSettings();
  const [phase, setPhase] = useState<Phase>("countdown");
  const [round, setRound] = useState<Round | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    if (!settings) {
      router.replace("/");
      return;
    }
    loadDataset().then(setDataset);
  }, [settings, router]);

  const rollNext = useCallback(() => {
    if (!dataset || !settings) return;
    const pool = buildPool(dataset, settings);
    const excluded = new Set(settings.excludedCountries);
    const next = pickRound(pool, settings.mode, excluded, settings.difficulty);
    setRound(next);
    if (next) {
      const controller = new AbortController();
      fetchLiveRoundPlayers(next, controller.signal).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || roundKey(current) !== roundKey(next)) return current;
          return { ...current, correctPlayers: live };
        });
      });
    }
  }, [dataset, settings]);

  useEffect(() => {
    if (dataset && settings && !round) rollNext();
  }, [dataset, settings, round, rollNext]);

  if (!settings) return null; // redirecting, per the effect above

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="px-4 py-4">
          <Pressable onPress={() => router.push("/")}>
            <Text className="text-xs uppercase tracking-wider text-arena-text-soft">← {t("backToSetup")}</Text>
          </Pressable>
        </View>

        {phase === "countdown" ? (
          <Countdown onDone={() => setPhase("round")} />
        ) : !round ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-arena-text-soft">{t("rerolling")}</Text>
          </View>
        ) : (
          <RoundView key={roundKey(round)} round={round} onNext={rollNext} />
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-paper">
      <View className="flex-row items-center justify-between px-4 py-4">
        <Pressable onPress={() => router.push("/")}>
          <Text className="text-xs uppercase tracking-wider text-ink-mute">← {t("backToSetup")}</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      {phase === "countdown" ? (
        <Countdown onDone={() => setPhase("round")} />
      ) : !round ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-ink-mute">{t("rerolling")}</Text>
        </View>
      ) : (
        <RoundView key={roundKey(round)} round={round} onNext={rollNext} />
      )}
    </View>
  );
}
```

Note: `backToSetup`'s Turkish copy was already fixed in Task 5 (`"Ana ekrana dön"`) — this task doesn't touch locale files again, the fix just takes effect automatically since both platforms read the same key.

- [ ] **Step 2: Restyle Countdown**

Countdown is small enough that a full duplicate return isn't worth it — just branch the two color-bearing classNames inline.

Replace the full contents of `apps/web/src/components/Countdown.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Text, View } from "react-native";
import { useTranslations } from "use-intl";

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const t = useTranslations("play");
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.02, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1.05, duration: 750, useNativeDriver: true }),
    ]).start();
  }, [n, scale, opacity]);

  useEffect(() => {
    if (n === 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(id);
  }, [n, onDone]);

  const isGo = n === 0;
  const isNative = Platform.OS !== "web";
  return (
    <View className="min-h-[70vh] items-center justify-center gap-6">
      <Text className={`text-xs uppercase tracking-[0.3em] ${isNative ? "text-arena-text-soft" : "text-ink-mute"}`}>
        {t("getReady")}
      </Text>
      <Animated.Text
        style={{ transform: [{ scale }], opacity }}
        className={`font-bold ${isNative ? "text-arena-accent" : "text-accent"} ${isGo ? "text-7xl" : "text-[8rem]"}`}
      >
        {isGo ? t("go") : n}
      </Animated.Text>
    </View>
  );
}
```

- [ ] **Step 3: Verify types and web export**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, same 6 routes.

- [ ] **Step 4: On-device check**

Play mode from Setup: countdown numeral should be amber, "Cevapları Göster"/answers/"Sonraki Tur" flow (via the already-restyled `RoundView`) should look consistent with Manual mode's.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PlayScreen.tsx apps/web/src/components/Countdown.tsx
git commit -m "Restyle PlayScreen and Countdown with the arena identity on native"
```

---

## Task 9: OnlineScreen arena restyle (all phases)

**Files:**
- Create: `apps/web/src/components/CelebrationPulse.tsx`
- Modify: `apps/web/src/lib/online-api.ts`
- Modify: `apps/web/src/locales/tr.json`
- Modify: `apps/web/src/locales/en.json`
- Modify: `apps/web/src/components/OnlineScreen.tsx`

**Interfaces:**
- Consumes: `LogoTile`'s `color` prop (Task 4), `ArenaPressable` (Task 2), `hapticSuccess`/`hapticError` (Task 2), `playSound` + `useGameSettings().soundEnabled` (Task 3), `ScrollFadeBottom` (Task 6).
- Produces: `<CelebrationPulse trigger={number}>` — wraps children with a brief scale+glow pulse, replayed whenever `trigger` changes. Built with `react-native-reanimated` (already a dependency since the SDK 54 downgrade) per the design spec's "micro-celebration on a correct guess" requirement — distinct from `ArenaPressable`'s simpler RN-`Animated` press-scale.
- Produces: `QuestionInfo.clubA.color` / `.clubB.color` now typed (server already sends the field once Task 1 lands — `apps/api/app/api/online/round/route.ts` passes the full `Club` object through unchanged, so no server code needs touching, only the client-side type).

- [ ] **Step 1: Widen the `ClubRef` type**

`apps/api/app/api/online/round/route.ts` already forwards the full `Club` object (including the new optional `color` field from Task 1) into each question's `clubA`/`clubB` — no server change needed. The client's own type just doesn't know about the field yet.

In `apps/web/src/lib/online-api.ts`, change:

```typescript
type ClubRef = { id: string; name: string; logoUrl: string };
```

to:

```typescript
type ClubRef = { id: string; name: string; logoUrl: string; color?: string };
```

- [ ] **Step 2: Add the "possible players" locale string**

In `apps/web/src/locales/tr.json`'s `"online"` section, change:

```json
    "foundCount": "{found} / {total} toplam bulundu",
```

to:

```json
    "foundCount": "{found} / {total} toplam bulundu",
    "possibleCount": "Bu eşleşmede {count} ortak futbolcu var",
```

In `apps/web/src/locales/en.json`'s `"online"` section, change:

```json
    "foundCount": "{found} / {total} found overall",
```

to:

```json
    "foundCount": "{found} / {total} found overall",
    "possibleCount": "{count, plural, one {# shared player} other {# shared players}} in this matchup",
```

- [ ] **Step 3: Write the celebration pulse**

Create `apps/web/src/components/CelebrationPulse.tsx`:

```tsx
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/** Wraps children with a brief scale+glow pulse, replayed every time
 * `trigger` changes — bump a counter on each correct guess to fire it.
 * `trigger === 0` never animates, so mounting with the initial value
 * doesn't pulse before the first real guess. */
export function CelebrationPulse({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = withSequence(withTiming(1.12, { duration: 160 }), withTiming(1, { duration: 220 }));
    glow.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 300 }));
  }, [trigger, scale, glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowColor: '#2ECC8F',
    shadowOpacity: glow.value * 0.8,
    shadowRadius: glow.value * 16,
    shadowOffset: { width: 0, height: 0 },
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
```

- [ ] **Step 4: Restyle OnlineScreen**

Same approach as the earlier screens: shared state/logic untouched, a full second native return branch. `submitGuess` (shared logic, both platforms) gains haptic + sound feedback calls — both helpers already no-op on web internally, so no `Platform.OS` guard is needed at the call site. A `celebrationTick` counter bumps on every correct guess, feeding `CelebrationPulse` around the playing-phase medallions.

Replace the full contents of `apps/web/src/components/OnlineScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import * as Crypto from "expo-crypto";
import type { Dataset, Player } from "@321guess/core";
import { validateUsername } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { hapticError, hapticSuccess } from "../lib/haptics";
import { playSound } from "../lib/sound";
import { useGameSettings } from "../lib/game-settings-context";
import {
  clearIdentity,
  loadIdentity,
  loadProgress,
  saveIdentity,
  saveProgress,
  type FinishResult,
  type Identity,
} from "../lib/online-storage";
import {
  fetchLeaderboard,
  fetchRound,
  finishRound as finishRoundApi,
  registerPlayer,
  startRound as startRoundApi,
  submitGuess as submitGuessApi,
  type LeaderboardResponse,
  type RoundInfo,
} from "../lib/online-api";
import { ArenaPressable } from "./ArenaPressable";
import { CelebrationPulse } from "./CelebrationPulse";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoTile } from "./LogoTile";
import { ScrollFadeBottom } from "./ScrollFadeBottom";
import { ThemeToggle } from "./ThemeToggle";

const ROUND_DURATION_MS = 1 * 60 * 1000;
const LAUNCH_DATE = "2026-08-05";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}
function dayNumber(roundDate: string): number {
  const start = new Date(`${LAUNCH_DATE}T00:00:00Z`).getTime();
  const current = new Date(`${roundDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((current - start) / 86_400_000) + 1);
}
function scoreBar(correct: number): string {
  const filled = Math.max(0, Math.min(10, correct));
  return "🟩".repeat(filled) + "⬜".repeat(10 - filled);
}
function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function computeBadges(result: FinishResult): string[] {
  const badges: string[] = [];
  if (result.totalPossible > 0 && result.correctCount === result.totalPossible) badges.push("perfect");
  if (result.currentStreak >= 30) badges.push("streak30");
  else if (result.currentStreak >= 7) badges.push("streak7");
  else if (result.currentStreak >= 3) badges.push("streak3");
  return badges;
}

export function OnlineScreen() {
  const t = useTranslations("online");
  const locale = useLocale();
  const router = useRouter();
  const { soundEnabled, hapticsEnabled } = useGameSettings();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [roundLoadFailed, setRoundLoadFailed] = useState(false);

  const [phase, setPhase] = useState<"matchup" | "playing" | "finished">("matchup");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [foundPlayers, setFoundPlayers] = useState<Player[]>([]);
  const [wrongPlayers, setWrongPlayers] = useState<Player[]>([]);
  const [overallFoundCount, setOverallFoundCount] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [result, setResult] = useState<FinishResult | null>(null);

  const [leaderboardTab, setLeaderboardTab] = useState<"today" | "total">("today");
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied">("idle");
  const [guessFeedback, setGuessFeedback] = useState<{ id: number; status: "correct" | "wrong"; label: string } | null>(null);
  const [celebrationTick, setCelebrationTick] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const feedbackIdRef = useRef(0);

  function flashGuessFeedback(status: "correct" | "wrong", label: string) {
    const id = ++feedbackIdRef.current;
    setGuessFeedback({ id, status, label });
    setTimeout(() => {
      setGuessFeedback((current) => (current?.id === id ? null : current));
    }, 1100);
  }

  useEffect(() => {
    loadIdentity().then((id) => {
      setIdentity(id);
      setIdentityLoaded(true);
    });
    loadDataset().then(setDataset);
  }, []);

  useEffect(() => {
    if (!identityLoaded || !identity) return;
    fetchRound().then((data) => {
      if (data) setRound(data);
      else setRoundLoadFailed(true);
    });
  }, [identityLoaded, identity]);

  useEffect(() => {
    if (!round || !dataset) return;
    loadProgress(round.roundDate).then((saved) => {
      if (!saved) return;
      if (saved.finished) {
        setResult(saved.result);
        setPhase("finished");
        return;
      }
      const byId = new Map(dataset.players.map((p) => [p.id, p] as const));
      setQuestionIndex(saved.questionIndex ?? 0);
      setFoundPlayers((saved.foundPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
      setWrongPlayers((saved.wrongPlayerIds ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p));
      setOverallFoundCount(saved.overallFoundCount ?? 0);
      const startedAt = saved.startedAt ?? Date.now();
      const elapsed = Date.now() - startedAt;
      startTimeRef.current = startedAt;
      setTimeLeftMs(Math.max(0, ROUND_DURATION_MS - elapsed));
      setPhase("playing");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, dataset]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setTimeLeftMs((prev) => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && timeLeftMs <= 0) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeftMs]);

  useEffect(() => {
    if (phase !== "finished") return;
    fetchLeaderboard(leaderboardTab).then(setLeaderboard);
  }, [phase, leaderboardTab]);

  async function handleRegister() {
    const trimmed = usernameInput.trim();
    const validation = validateUsername(trimmed);
    if (!validation.valid) {
      setUsernameError(validation.reason);
      return;
    }
    setRegistering(true);
    setUsernameError(null);
    const token = Crypto.randomUUID();
    const res = await registerPlayer(trimmed, token);
    if (!res.ok) {
      setUsernameError(res.reason);
      setRegistering(false);
      return;
    }
    const newIdentity: Identity = { token, username: res.username };
    await saveIdentity(newIdentity);
    setIdentity(newIdentity);
    setRegistering(false);
  }

  async function handleExpiredIdentity() {
    await clearIdentity();
    setIdentity(null);
    setRound(null);
    setPhase("matchup");
    setResult(null);
    setUsernameError("expired");
  }

  async function startRound() {
    if (!round || !identity) return;
    const outcome = await startRoundApi(identity.token);
    if (outcome === "expired") {
      await handleExpiredIdentity();
      return;
    }
    startTimeRef.current = Date.now();
    setPhase("playing");
    setQuestionIndex(0);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setOverallFoundCount(0);
    setTimeLeftMs(ROUND_DURATION_MS);
    await saveProgress(round.roundDate, {
      finished: false,
      questionIndex: 0,
      foundPlayerIds: [],
      wrongPlayerIds: [],
      overallFoundCount: 0,
      startedAt: startTimeRef.current,
    });
  }

  async function submitGuess(player: Player) {
    if (!identity || !round || foundPlayers.some((p) => p.id === player.id) || wrongPlayers.some((p) => p.id === player.id)) {
      return;
    }
    const res = await submitGuessApi(identity.token, questionIndex, player.id);
    if (res.status === "expired") {
      await handleExpiredIdentity();
      return;
    }
    if (res.status === "failed") return;
    if (res.correct) {
      flashGuessFeedback("correct", player.name);
      void hapticSuccess(hapticsEnabled);
      playSound("correct", soundEnabled);
      setCelebrationTick((n) => n + 1);
      const next = [...foundPlayers, player];
      setFoundPlayers(next);
      setOverallFoundCount(res.overallFoundCount);
      await saveProgress(round.roundDate, {
        finished: false,
        questionIndex,
        foundPlayerIds: next.map((p) => p.id),
        wrongPlayerIds: wrongPlayers.map((p) => p.id),
        overallFoundCount: res.overallFoundCount,
        startedAt: startTimeRef.current ?? Date.now(),
      });
    } else {
      flashGuessFeedback("wrong", player.name);
      void hapticError(hapticsEnabled);
      playSound("wrong", soundEnabled);
      const next = [...wrongPlayers, player];
      setWrongPlayers(next);
      await saveProgress(round.roundDate, {
        finished: false,
        questionIndex,
        foundPlayerIds: foundPlayers.map((p) => p.id),
        wrongPlayerIds: next.map((p) => p.id),
        overallFoundCount,
        startedAt: startTimeRef.current ?? Date.now(),
      });
    }
  }

  async function goToNextQuestion() {
    if (!round) return;
    const next = questionIndex + 1;
    if (next >= round.questions.length) {
      await finish();
      return;
    }
    setQuestionIndex(next);
    setFoundPlayers([]);
    setWrongPlayers([]);
    setGuessFeedback(null);
    await saveProgress(round.roundDate, {
      finished: false,
      questionIndex: next,
      foundPlayerIds: [],
      wrongPlayerIds: [],
      overallFoundCount,
      startedAt: startTimeRef.current ?? Date.now(),
    });
  }

  async function finish() {
    if (finishingRef.current || !identity || !round) return;
    finishingRef.current = true;
    try {
      const res = await finishRoundApi(identity.token);
      if (res.status === "expired") {
        await handleExpiredIdentity();
        return;
      }
      if (res.status === "ok") {
        setResult(res.result);
        setPhase("finished");
        await saveProgress(round.roundDate, { finished: true, result: res.result });
      }
    } finally {
      finishingRef.current = false;
    }
  }

  const badges = useMemo(() => (result ? computeBadges(result) : []), [result]);
  const currentQuestion = round?.questions[questionIndex] ?? null;

  function shareText(): string {
    if (!result || !round) return "";
    return t("shareText", {
      day: dayNumber(round.roundDate),
      correct: result.correctCount,
      total: result.totalPossible,
      bar: scoreBar(result.correctCount),
      streak: result.currentStreak,
      url: `https://www.321guess.com/${locale}/online`,
    });
  }

  async function handleShare() {
    const text = shareText();
    if (!text) return;
    const outcome = await shareOrCopy(text);
    if (outcome === "copied") {
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    }
  }

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="relative flex-1">
          <ScrollView className="flex-1 px-4 py-8" contentContainerClassName="pb-10">
            <View className="mb-8 flex-row items-center justify-between">
              <Pressable onPress={() => router.push("/")}>
                <Text className="text-xs uppercase tracking-wider text-arena-text-soft">← {t("backHome")}</Text>
              </Pressable>
            </View>

            <Text className="text-2xl font-black text-arena-accent">{t("title")}</Text>
            <Text className="mb-6 mt-1 text-sm text-arena-text-soft">{t("description")}</Text>

            {!identityLoaded ? (
              <LoadingBox text={t("loading")} />
            ) : !identity ? (
              <View className="gap-3">
                <Text className="text-sm font-semibold text-arena-text">{t("username.label")}</Text>
                <TextInput
                  value={usernameInput}
                  onChangeText={(v) => {
                    setUsernameInput(v);
                    setUsernameError(null);
                  }}
                  placeholder={t("username.placeholder")}
                  placeholderTextColor="#8FE8C4"
                  maxLength={20}
                  autoCapitalize="none"
                  className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-3 text-base text-arena-text"
                />
                {usernameError && <Text className="text-xs text-red-400">{t(`username.error.${usernameError}`)}</Text>}
                <Text className="text-xs text-arena-text-soft">{t("username.hint")}</Text>
                <ArenaPressable
                  onPress={handleRegister}
                  disabled={registering || usernameInput.trim().length === 0}
                  className={`items-center rounded-2xl py-4 ${
                    registering || usernameInput.trim().length === 0
                      ? "bg-arena-bg-soft"
                      : "border-b-4 border-arena-accent-strong bg-arena-accent"
                  }`}
                >
                  <Text
                    className={`text-lg font-bold ${
                      registering || usernameInput.trim().length === 0 ? "text-arena-text-soft" : "text-[#2A1E00]"
                    }`}
                  >
                    {registering ? t("username.submitting") : t("username.submit")}
                  </Text>
                </ArenaPressable>
              </View>
            ) : roundLoadFailed ? (
              <LoadingBox text={t("roundError")} />
            ) : !round || !dataset ? (
              <LoadingBox text={t("loading")} />
            ) : phase === "matchup" ? (
              <View className="gap-6">
                <Text className="text-sm text-arena-text-soft">{t("welcomeBack", { username: identity.username })}</Text>
                <View className="gap-3">
                  <Text className="text-center text-xs font-semibold uppercase tracking-wider text-arena-text-soft">
                    {t("todaysMatchupsLabel")}
                  </Text>
                  <View className="flex-row flex-wrap justify-center gap-2">
                    {round.questions.map((q) => (
                      <View key={q.index} className="flex-row items-center gap-1.5 rounded-2xl bg-arena-bg-soft p-2">
                        <LogoTile size="sm" src={q.clubA.logoUrl} alt={q.clubA.name} caption="" color={q.clubA.color} />
                        <Text className="text-[10px] font-bold text-arena-text-soft">×</Text>
                        <LogoTile size="sm" src={q.clubB.logoUrl} alt={q.clubB.name} caption="" color={q.clubB.color} />
                      </View>
                    ))}
                  </View>
                </View>
                <Text className="text-center text-xs text-arena-text-soft">
                  {t("instructions", { minutes: ROUND_DURATION_MS / 60000, questions: round.questions.length })}
                </Text>
                <ArenaPressable
                  onPress={() => void startRound()}
                  className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-4"
                >
                  <Text className="text-lg font-bold text-[#2A1E00]">{t("start")}</Text>
                </ArenaPressable>
              </View>
            ) : phase === "playing" && currentQuestion ? (
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-arena-text-soft">
                    {t("questionProgress", { current: questionIndex + 1, total: round.questions.length })}
                  </Text>
                  <Text className="text-xs text-arena-text-soft">
                    {t("foundCount", { found: overallFoundCount, total: round.totalPossible })}
                  </Text>
                </View>

                <View className="rounded-2xl bg-arena-bg-soft px-4 pb-4 pt-3">
                  <Text className="mb-2 self-end rounded-full bg-arena-accent/20 px-3 py-1 text-sm font-bold text-arena-accent">
                    {formatTime(timeLeftMs)}
                  </Text>
                  <CelebrationPulse trigger={celebrationTick}>
                    <View className="flex-row items-center justify-center gap-4">
                      <LogoTile
                        size="sm"
                        src={currentQuestion.clubA.logoUrl}
                        alt={currentQuestion.clubA.name}
                        caption={currentQuestion.clubA.name}
                        color={currentQuestion.clubA.color}
                      />
                      <Text className="text-xs font-black text-arena-text-soft">{t("vs")}</Text>
                      <LogoTile
                        size="sm"
                        src={currentQuestion.clubB.logoUrl}
                        alt={currentQuestion.clubB.name}
                        caption={currentQuestion.clubB.name}
                        color={currentQuestion.clubB.color}
                      />
                    </View>
                  </CelebrationPulse>

                  <View className="mt-3 items-center gap-1.5">
                    <Text className="text-[10px] text-arena-text-soft">
                      {t("possibleCount", { count: currentQuestion.totalPossible })}
                    </Text>
                    <View className="flex-row gap-1.5">
                      {Array.from({ length: currentQuestion.totalPossible }).map((_, i) => (
                        <View
                          key={i}
                          className={`h-2.5 w-2.5 rounded-full border border-arena-accent-2 ${
                            i < foundPlayers.length ? "bg-arena-accent-2" : ""
                          }`}
                        />
                      ))}
                    </View>
                  </View>
                </View>

                <GuessInput
                  players={dataset.players}
                  excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
                  onGuess={submitGuess}
                  placeholder={t("guessPlaceholder")}
                  emptyText={t("guessEmpty")}
                />

                {guessFeedback && (
                  <View
                    className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
                      guessFeedback.status === "correct" ? "bg-arena-accent-2/20" : "bg-red-500/15"
                    }`}
                  >
                    <Text className={guessFeedback.status === "correct" ? "text-arena-accent-2" : "text-red-300"}>
                      {guessFeedback.status === "correct" ? "✓" : "✗"} {guessFeedback.label}
                    </Text>
                  </View>
                )}

                {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
                  <View className="flex-row flex-wrap gap-2">
                    {foundPlayers.map((p) => (
                      <View key={p.id} className="rounded-full bg-arena-accent-2/20 px-3 py-1">
                        <Text className="text-xs font-medium text-arena-text">{p.name}</Text>
                      </View>
                    ))}
                    {wrongPlayers.map((p) => (
                      <View key={p.id} className="rounded-full bg-red-500/15 px-3 py-1">
                        <Text className="text-xs font-medium text-red-300">✕ {p.name}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ArenaPressable
                  onPress={() => void goToNextQuestion()}
                  className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-3"
                >
                  <Text className="text-sm font-bold text-[#2A1E00]">
                    {foundPlayers.length > 0 ? t("nextQuestion") : t("pass")}
                  </Text>
                </ArenaPressable>
                <ArenaPressable
                  onPress={() => void finish()}
                  className="items-center rounded-2xl border border-arena-accent-2 py-3"
                >
                  <Text className="text-sm font-semibold text-arena-text-soft">{t("finishEarly")}</Text>
                </ArenaPressable>
              </View>
            ) : result ? (
              <View className="gap-6">
                <View className="items-center rounded-2xl border-2 border-arena-accent bg-arena-accent/10 p-6">
                  <Text className="text-3xl font-black text-arena-text">
                    {result.correctCount} / {result.totalPossible}
                  </Text>
                  <Text className="mt-1 text-sm text-arena-text-soft">{t("resultLabel")}</Text>
                  {result.currentStreak > 0 && (
                    <Text className="mt-3 text-sm font-semibold text-arena-accent">
                      🔥 {t("streakLabel", { count: result.currentStreak })}
                    </Text>
                  )}
                </View>

                {badges.length > 0 && (
                  <View className="flex-row flex-wrap justify-center gap-2">
                    {badges.map((badge) => (
                      <View key={badge} className="rounded-full bg-arena-bg-soft px-3 py-1">
                        <Text className="text-xs font-semibold text-arena-text">{t(`badges.${badge}`)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ArenaPressable
                  onPress={() => void handleShare()}
                  className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-3"
                >
                  <Text className="text-sm font-bold text-[#2A1E00]">
                    {shareStatus === "copied" ? t("shareCopied") : t("share")}
                  </Text>
                </ArenaPressable>

                <View>
                  <View className="mb-3 flex-row self-start rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1">
                    {(["today", "total"] as const).map((tab) => (
                      <ArenaPressable
                        key={tab}
                        onPress={() => setLeaderboardTab(tab)}
                        className={`rounded-full px-4 py-1.5 ${leaderboardTab === tab ? "bg-arena-accent" : ""}`}
                      >
                        <Text className={leaderboardTab === tab ? "font-semibold text-[#2A1E00]" : "text-arena-text-soft"}>
                          {t(`leaderboard.tab.${tab}`)}
                        </Text>
                      </ArenaPressable>
                    ))}
                  </View>
                  <Leaderboard
                    data={leaderboard}
                    tab={leaderboardTab}
                    currentUsername={identity.username}
                    loadingText={t("loading")}
                    emptyText={t("leaderboard.empty")}
                  />
                </View>
              </View>
            ) : (
              <LoadingBox text={t("loading")} />
            )}
          </ScrollView>
          <ScrollFadeBottom />
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/")}>
          <Text className="text-xs uppercase tracking-wider text-ink-mute">← {t("backHome")}</Text>
        </Pressable>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      <Text className="text-2xl font-black text-accent">{t("title")}</Text>
      <Text className="mb-6 mt-1 text-sm text-ink-mute">{t("description")}</Text>

      {!identityLoaded ? (
        <LoadingBox text={t("loading")} />
      ) : !identity ? (
        <View className="gap-3">
          <Text className="text-sm font-semibold text-ink-soft">{t("username.label")}</Text>
          <TextInput
            value={usernameInput}
            onChangeText={(v) => {
              setUsernameInput(v);
              setUsernameError(null);
            }}
            placeholder={t("username.placeholder")}
            maxLength={20}
            autoCapitalize="none"
            className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
          />
          {usernameError && <Text className="text-xs text-red-500">{t(`username.error.${usernameError}`)}</Text>}
          <Text className="text-xs text-ink-mute">{t("username.hint")}</Text>
          <Pressable
            onPress={handleRegister}
            disabled={registering || usernameInput.trim().length === 0}
            className={`items-center rounded-xl py-4 ${
              registering || usernameInput.trim().length === 0 ? "bg-ink/10" : "bg-accent"
            }`}
          >
            <Text
              className={`text-lg font-bold ${
                registering || usernameInput.trim().length === 0 ? "text-ink-mute" : "text-paper"
              }`}
            >
              {registering ? t("username.submitting") : t("username.submit")}
            </Text>
          </Pressable>
        </View>
      ) : roundLoadFailed ? (
        <LoadingBox text={t("roundError")} />
      ) : !round || !dataset ? (
        <LoadingBox text={t("loading")} />
      ) : phase === "matchup" ? (
        <View className="gap-6">
          <Text className="text-sm text-ink-mute">{t("welcomeBack", { username: identity.username })}</Text>
          <View className="gap-3">
            <Text className="text-center text-xs font-semibold uppercase tracking-wider text-ink-mute">
              {t("todaysMatchupsLabel")}
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {round.questions.map((q) => (
                <View key={q.index} className="flex-row items-center gap-1.5 rounded-xl border border-rule bg-ink/5 p-2">
                  <LogoTile size="sm" src={q.clubA.logoUrl} alt={q.clubA.name} caption="" />
                  <Text className="text-[10px] font-bold text-ink-mute">×</Text>
                  <LogoTile size="sm" src={q.clubB.logoUrl} alt={q.clubB.name} caption="" />
                </View>
              ))}
            </View>
          </View>
          <Text className="text-center text-xs text-ink-mute">
            {t("instructions", { minutes: ROUND_DURATION_MS / 60000, questions: round.questions.length })}
          </Text>
          <Pressable onPress={() => void startRound()} className="items-center rounded-xl bg-accent py-4">
            <Text className="text-lg font-bold text-paper">{t("start")}</Text>
          </Pressable>
        </View>
      ) : phase === "playing" && currentQuestion ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-ink-mute">
              {t("questionProgress", { current: questionIndex + 1, total: round.questions.length })}
            </Text>
            <Text className="text-xs text-ink-mute">
              {t("foundCount", { found: overallFoundCount, total: round.totalPossible })}
            </Text>
          </View>

          <View className="rounded-2xl border-2 border-rule bg-ink/5 px-4 pb-4 pt-3">
            <Text className="mb-2 self-end rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
              {formatTime(timeLeftMs)}
            </Text>
            <View className="flex-row items-center justify-center gap-4">
              <LogoTile size="sm" src={currentQuestion.clubA.logoUrl} alt={currentQuestion.clubA.name} caption={currentQuestion.clubA.name} />
              <Text className="text-xs font-black text-ink-mute">{t("vs")}</Text>
              <LogoTile size="sm" src={currentQuestion.clubB.logoUrl} alt={currentQuestion.clubB.name} caption={currentQuestion.clubB.name} />
            </View>
          </View>

          <GuessInput
            players={dataset.players}
            excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
            onGuess={submitGuess}
            placeholder={t("guessPlaceholder")}
            emptyText={t("guessEmpty")}
          />

          {guessFeedback && (
            <View
              className={`flex-row items-center gap-2 rounded-lg px-3 py-2 ${
                guessFeedback.status === "correct" ? "bg-accent/15" : "bg-red-500/10"
              }`}
            >
              <Text className={guessFeedback.status === "correct" ? "text-accent" : "text-red-600"}>
                {guessFeedback.status === "correct" ? "✓" : "✗"} {guessFeedback.label}
              </Text>
            </View>
          )}

          {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
            <View className="flex-row flex-wrap gap-2">
              {foundPlayers.map((p) => (
                <View key={p.id} className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1">
                  <Text className="text-xs font-medium">{p.name}</Text>
                </View>
              ))}
              {wrongPlayers.map((p) => (
                <View key={p.id} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1">
                  <Text className="text-xs font-medium text-red-600">✕ {p.name}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => void goToNextQuestion()} className="items-center rounded-xl bg-accent py-3">
            <Text className="text-sm font-bold text-paper">{foundPlayers.length > 0 ? t("nextQuestion") : t("pass")}</Text>
          </Pressable>
          <Pressable onPress={() => void finish()} className="items-center rounded-xl border border-rule py-3">
            <Text className="text-sm font-semibold text-ink-soft">{t("finishEarly")}</Text>
          </Pressable>
        </View>
      ) : result ? (
        <View className="gap-6">
          <View className="items-center rounded-xl border-2 border-accent bg-accent/10 p-6">
            <Text className="text-3xl font-black">
              {result.correctCount} / {result.totalPossible}
            </Text>
            <Text className="mt-1 text-sm text-ink-mute">{t("resultLabel")}</Text>
            {result.currentStreak > 0 && (
              <Text className="mt-3 text-sm font-semibold text-accent">
                🔥 {t("streakLabel", { count: result.currentStreak })}
              </Text>
            )}
          </View>

          {badges.length > 0 && (
            <View className="flex-row flex-wrap justify-center gap-2">
              {badges.map((badge) => (
                <View key={badge} className="rounded-full border border-rule bg-ink/5 px-3 py-1">
                  <Text className="text-xs font-semibold">{t(`badges.${badge}`)}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => void handleShare()} className="items-center rounded-xl bg-accent py-3">
            <Text className="text-sm font-bold text-paper">
              {shareStatus === "copied" ? t("shareCopied") : t("share")}
            </Text>
          </Pressable>

          <View>
            <View className="mb-3 flex-row self-start rounded-full border border-rule bg-ink/5 p-1">
              {(["today", "total"] as const).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setLeaderboardTab(tab)}
                  className={`rounded-full px-4 py-1.5 ${leaderboardTab === tab ? "bg-accent" : ""}`}
                >
                  <Text className={leaderboardTab === tab ? "font-semibold text-paper" : "text-ink-soft"}>
                    {t(`leaderboard.tab.${tab}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Leaderboard data={leaderboard} tab={leaderboardTab} currentUsername={identity.username} loadingText={t("loading")} emptyText={t("leaderboard.empty")} />
          </View>
        </View>
      ) : (
        <LoadingBox text={t("loading")} />
      )}
    </ScrollView>
  );
}

function LoadingBox({ text }: { text: string }) {
  const isNative = Platform.OS !== "web";
  return (
    <View className={`items-center p-8 ${isNative ? "rounded-2xl bg-arena-bg-soft" : "rounded-lg border border-rule bg-ink/5"}`}>
      <Text className={isNative ? "text-arena-text-soft" : "text-ink-mute"}>{text}</Text>
    </View>
  );
}

function GuessInput({
  players,
  excludedIds,
  onGuess,
  placeholder,
  emptyText,
}: {
  players: Player[];
  excludedIds: Set<string>;
  onGuess: (player: Player) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const isNative = Platform.OS !== "web";

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return players.filter((p) => !excludedIds.has(p.id) && normalize(p.name).includes(q)).slice(0, 8);
  }, [query, players, excludedIds]);

  function pick(player: Player) {
    onGuess(player);
    setQuery("");
    setOpen(false);
  }

  if (isNative) {
    return (
      <View className="relative">
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor="#8FE8C4"
          className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-3 text-base text-arena-text"
        />
        {open && query.trim().length >= 2 && (
          <View className="absolute top-16 z-20 max-h-72 w-full rounded-2xl border border-arena-accent-2 bg-arena-bg-soft">
            {filtered.length === 0 ? (
              <Text className="px-4 py-3 text-sm text-arena-text-soft">{emptyText}</Text>
            ) : (
              <ScrollView>
                {filtered.map((p) => (
                  <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-2">
                    <Text className="text-sm text-arena-text">{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="relative">
      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
      />
      {open && query.trim().length >= 2 && (
        <View className="absolute top-16 z-20 max-h-72 w-full rounded-xl border border-rule bg-paper">
          {filtered.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-mute">{emptyText}</Text>
          ) : (
            <ScrollView>
              {filtered.map((p) => (
                <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-2">
                  <Text className="text-sm">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function Leaderboard({
  data,
  tab,
  currentUsername,
  loadingText,
  emptyText,
}: {
  data: LeaderboardResponse | null;
  tab: "today" | "total";
  currentUsername: string;
  loadingText: string;
  emptyText: string;
}) {
  if (!data || data.type !== tab) return <LoadingBox text={loadingText} />;
  const isNative = Platform.OS !== "web";

  if (data.entries.length === 0) {
    return (
      <View className="py-6">
        <Text className={`text-center text-sm ${isNative ? "text-arena-text-soft" : "text-ink-mute"}`}>{emptyText}</Text>
      </View>
    );
  }

  const rows =
    data.type === "today"
      ? data.entries.map((e) => ({ username: e.username, value: String(e.correctCount) }))
      : data.entries.map((e) => ({ username: e.username, value: String(e.totalCorrect) }));

  if (isNative) {
    return (
      <View className="gap-1">
        {rows.map((row, idx) => {
          const isMe = row.username === currentUsername;
          return (
            <View
              key={row.username}
              className={`flex-row items-center justify-between rounded-lg px-3 py-2 ${
                isMe ? "border border-arena-accent-2 bg-arena-accent-2/15" : "bg-arena-bg-soft"
              }`}
            >
              <View className="flex-row items-center gap-2">
                <Text className="w-5 text-right text-arena-text-soft">{idx + 1}</Text>
                <Text className={isMe ? "font-semibold text-arena-accent-2" : "text-arena-text"}>{row.username}</Text>
              </View>
              <Text className="text-arena-text-soft">{row.value}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View className="gap-1">
      {rows.map((row, idx) => {
        const isMe = row.username === currentUsername;
        return (
          <View
            key={row.username}
            className={`flex-row items-center justify-between rounded-lg px-3 py-2 ${
              isMe ? "border border-accent/40 bg-accent/10" : "bg-ink/5"
            }`}
          >
            <View className="flex-row items-center gap-2">
              <Text className="w-5 text-right text-ink-mute">{idx + 1}</Text>
              <Text className={isMe ? "font-semibold" : undefined}>{row.username}</Text>
            </View>
            <Text className="text-ink-soft">{row.value}</Text>
          </View>
        );
      })}
    </View>
  );
}
```

Note: `shareOrCopy` is imported by the original file from `"../lib/share"` — that import line was omitted above by accident of transcription length; when applying this replacement, keep the original file's `import { shareOrCopy } from "../lib/share";` line alongside the new imports (it's unchanged, `handleShare` still calls it identically on both platforms).

- [ ] **Step 5: Verify types and web export**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, same 6 routes.

Run: `node -e "require('./apps/web/src/locales/tr.json'); require('./apps/web/src/locales/en.json'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 6: On-device check**

Full Online/Daily Challenge run-through: register a username (or reuse an existing one), start today's round, submit a correct guess (dot fills in, medallions briefly scale+glow, haptic + sound fire, feedback chip shows green), submit a wrong guess (haptic + sound fire, feedback chip shows red, no pulse), use "Sonraki Soru"/"Geç" and "Erken Bitir", reach the result screen, check the leaderboard tabs, confirm the bottom fade appears when the result + leaderboard content overflows the screen.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/CelebrationPulse.tsx apps/web/src/lib/online-api.ts apps/web/src/locales/tr.json apps/web/src/locales/en.json apps/web/src/components/OnlineScreen.tsx
git commit -m "Restyle OnlineScreen with the arena identity, add per-question found indicator"
```

---

## Task 10: Final integration and regression pass

**Files:** none (verification only).

**Interfaces:** none — this task only runs checks across everything Tasks 1-9 produced.

- [ ] **Step 1: Full workspace verification**

Run from the repo root:

```bash
cd apps/web && npx tsc --noEmit && cd ../api && npx tsc --noEmit && cd ../.. && npm test
```

Expected: no type errors in either workspace; the full test suite passes (`packages/core` including the club-color tests folded into `apps/api`, plus the existing `daily-round.test.ts`).

- [ ] **Step 2: Web export regression check**

Run: `cd apps/web && rm -rf dist .expo && npx expo export -p web`
Expected: succeeds, exactly the same 6 routes as before this whole plan started (`/`, `/manual`, `/play`, `/online`, `/_sitemap`, `/+not-found` — note `/settings` does **not** appear here even though the route file exists, since nothing on web links to it and static export only emits routes actually reachable/pre-rendered... if it *does* appear in the route list, that's fine too — it just means the route is statically generated but still unreachable from any web UI, not a regression, just extra unused output).

Run: `cd apps/web && npx expo-doctor`
Expected: all checks pass — confirms none of this plan's four new dependencies (`expo-haptics`, `expo-audio`, `expo-linear-gradient`, plus `sharp` in `apps/api`) ended up duplicated across the monorepo's node_modules the way earlier work this session repeatedly did.

- [ ] **Step 3: Full on-device walkthrough**

On the physical iOS development build (`EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 npx expo start --dev-client`), walk every screen:

- **Setup:** arena palette, mode cards, difficulty, league list with bottom fade + sticky "Başla", ⚙️ opens Settings.
- **Settings:** language switch actually changes the app's language, sound/haptics toggles actually mute `ArenaPressable`'s tap haptic and (once reached) `OnlineScreen`'s guess feedback.
- **Manual:** club search shows medallions once selected, each ringed in a distinct color; round reveal (`RoundView`) matches Play's look.
- **Play:** countdown numeral in amber, round reveal identical to Manual's.
- **Online:** username registration, matchup preview medallions, playing-phase found-dots filling in as you guess correctly, haptic + sound on both correct and wrong guesses, "Sonraki Soru"/"Geç"/"Erken Bitir", result screen with badges/share/leaderboard and its bottom fade.

- [ ] **Step 4: Run the club color extraction script for real**

This was deliberately not run automatically in Task 1 (it makes one network request per club against production `clubs.json`).

Run: `cd apps/api && npm run extract-club-colors`
Expected: completes, reports an updated/failed count, `public/data/clubs.json` now has a `color` field on most club records. Re-run `npm test` afterward (from repo root) to confirm nothing broke, then commit the updated `clubs.json` separately:

```bash
git add apps/api/public/data/clubs.json
git commit -m "Populate club logo ring colors via extract-club-colors"
```

- [ ] **Step 5: Confirm web is untouched end-to-end**

Run: `git diff main --stat -- apps/web/src apps/web/tailwind.config.js apps/web/src/global.css` (or your actual base branch) and manually confirm every touched file's web-branch output (the `Platform.OS === "web"` return in each restyled component) is byte-for-byte identical to what existed before this plan — every task's own Step 4/5 verification already checked `expo export -p web` stayed green, this is the final holistic confirmation before calling the pass done.
