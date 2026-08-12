# Port SetupScreen, PlayScreen, Countdown to apps/web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (executed directly this session, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the site's actual home page (`SetupScreen` — mode/difficulty/
league picker) and the core game loop (`Countdown` + `PlayScreen`) to
`apps/web`, and fix a routing mistake from the prior plan along the way:
`ManualScreen` was wired to `/` (the app's true home route belongs to
`SetupScreen`), so this plan moves it to its own `/manual` route.

**Architecture:** Replace the Expo template's two-tab demo shell
(`NativeTabs` with Home/Explore) with a plain `Stack` navigator — this
game's real navigation is push-based (Setup → Play, Setup → Manual,
Setup → Online), not tab-based, matching the old site's routing
(`/`, `/play`, `/manual`, `/online`). Settings bridging between Setup and
Play used `sessionStorage` on the old site (needed because Next.js
navigation was a real page load); React Native has no `sessionStorage`,
and Expo Router's push navigation keeps the app mounted in one JS
context, so a `GameSettingsContext` (same pattern as the prior plan's
`AppLocaleContext`) replaces it directly — simpler than the original.

**Tech Stack:** `expo-router`'s `Stack`, React Context for settings
bridging, React Native's `Animated` API for `Countdown` (see Global
Constraints — this is a correction to how the prior plan would have
approached animation).

## Global Constraints

- No subagent dispatch — direct execution, commit after each task. Never
  run `git reset --hard`, `git checkout -- .`, or `git clean`.
- **Animations must use React Native's `Animated` API, not a NativeWind/
  Tailwind `animate-*` class.** The old site's `countdown-soft` keyframe
  (`tailwind.config.ts`, ported nowhere yet) is a CSS `@keyframes` rule —
  NativeWind's `animate-*` utilities only emit CSS, which the web target
  renders but iOS/Android's native renderer has no CSS engine to run at
  all. A CSS-only animation would work in the browser and silently do
  nothing on a real device. This wasn't caught in the prior plan because
  no ported screen used an animation yet.
- Icons: `CrestIcon`, `FlagIcon`, `SearchIcon`, `TrophyIcon` (inline SVGs
  in the original) are ported as emoji, matching the precedent already
  set for `ThemeToggle`'s sun/moon icons in the prior plan (no
  `react-native-svg` dependency added in this plan; revisit for pixel
  fidelity in a later polish pass).
- Verification is still limited to: TypeScript compiles, `npx expo export
  -p web` succeeds and produces the expected content (grep the output),
  and `apps/api`/`packages/core`'s tests still pass. This environment has
  no iOS Simulator or Android emulator — native rendering needs a human
  to check (the same limitation as every prior plan).
- Every ported file's original content comes from `git show 8329015:<path>`
  (already fetched and quoted in full in this plan's steps — do not
  re-fetch, the content below is authoritative).

---

### Task 1: Replace the tab shell with a Stack navigator; move `ManualScreen` to `/manual`

**Files:**
- Modify: `apps/web/src/app/_layout.tsx` — replace `<AppTabs />` with `<Stack>`
- Delete: `apps/web/src/components/app-tabs.tsx`, `apps/web/src/components/app-tabs.web.tsx`
- Delete: `apps/web/src/app/explore.tsx` (template demo content, no longer reachable once tabs are gone)
- Create: `apps/web/src/app/manual.tsx`
- Modify: `apps/web/src/app/index.tsx` — no longer renders `ManualScreen`
  (Task 3 will make it render `SetupScreen` instead)

**Interfaces:** None new — this is routing/navigation restructuring only.

- [ ] **Step 1: Read the current `_layout.tsx` to edit precisely**

(It was last modified in the prior plan's Task 2 to add `AppLocaleProvider`/
`IntlBridge` — read the live file, don't assume its exact current text.)

- [ ] **Step 2: Replace `AppTabs` with `Stack`**

```diff
-import { AnimatedSplashOverlay } from '@/components/animated-icon';
-import AppTabs from '@/components/app-tabs';
+import { Stack } from 'expo-router';
+import { AnimatedSplashOverlay } from '@/components/animated-icon';
```
```diff
         <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
           <AnimatedSplashOverlay />
-          <AppTabs />
+          <Stack screenOptions={{ headerShown: false }} />
         </ThemeProvider>
```
(`headerShown: false` because every ported screen builds its own header
row with `ThemeToggle`/`LanguageSwitcher`, matching the old site's layout
— a native stack header would duplicate that.)

- [ ] **Step 3: Delete the tab components and the explore demo route**

```bash
cd /Users/munurcoskun/Claude/321guess
git rm apps/web/src/components/app-tabs.tsx apps/web/src/components/app-tabs.web.tsx apps/web/src/app/explore.tsx
```

- [ ] **Step 4: Move `ManualScreen`'s route**

```bash
git mv apps/web/src/app/index.tsx apps/web/src/app/manual.tsx
```
This carries over the prior plan's `<ManualScreen />` render as-is at the
new path. `index.tsx` gets recreated in Task 3 with `SetupScreen`.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: fails here — `index.tsx` doesn't exist yet (Task 3 creates it),
and `expo-router` requires an `index` route. This is expected and
resolved by Task 3; do not attempt to make this step pass in isolation.
Instead, just confirm the error is exactly "missing index route" /
`ManualScreen`-related, not something else — if it's a different error,
stop and investigate before proceeding to Task 2.

- [ ] **Step 6: Commit**

```bash
git add -A
git status --short
git commit -m "Replace tab shell with Stack navigator; move ManualScreen to /manual

index.tsx is intentionally left unrouted here — Task 3 of this plan adds
it back with SetupScreen, which is where it always belonged (mirroring
the old site's / -> SetupScreen, /manual -> ManualScreen split). This
commit alone leaves the app without a valid index route; that's expected
and resolved by the next commit, not a regression to bisect around."
```

---

### Task 2: Port `Countdown` (React Native `Animated`, not CSS keyframes)

**Files:**
- Create: `apps/web/src/components/Countdown.tsx`

**Interfaces:**
- Produces: `Countdown({ onDone: () => void })` — same prop shape as the
  original (`PlayScreen`, Task 4, renders this unchanged).

- [ ] **Step 1: Port the component**

Original (`git show 8329015:components/Countdown.tsx`, already fetched
this session — full content above) counts 3→2→1→"Go", firing `onDone`
after "Go" displays for one tick, animating each digit in with a
scale+fade. RN port using `Animated.Value` per tick instead of a CSS
keyframe:

```tsx
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
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
  return (
    <View className="min-h-[70vh] items-center justify-center gap-6">
      <Text className="text-xs uppercase tracking-[0.3em] text-ink-mute">{t("getReady")}</Text>
      <Animated.Text
        style={{ transform: [{ scale }], opacity }}
        className={`font-bold text-accent ${isGo ? "text-7xl" : "text-[8rem]"}`}
      >
        {isGo ? t("go") : n}
      </Animated.Text>
    </View>
  );
}
```
(Dropped the original's `[font-variant-numeric:tabular-nums]` and serif/
italic styling for the "Go" state — cosmetic details, not behavior;
revisit in a polish pass if a human checking it in-browser wants them
back. The opacity 0→1→(stays 1, never fades back to 0 at end of each
tick's animation) differs slightly from the original's full keyframe
which faded back out at 100% — this port re-triggers the same
fade-in-and-settle each tick via the `useEffect` on `n`, which is the
behaviorally important part: each new number visibly animates in.)

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/web && npx tsc --noEmit
```
Expected: same pre-existing "missing index route" error from Task 1,
Step 5 — nothing new introduced by this file. If a *different* new error
appears, investigate before continuing.

- [ ] **Step 3: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/components/Countdown.tsx
git commit -m "Port Countdown to apps/web using RN Animated (not CSS keyframes)"
```

---

### Task 3: Port `SetupScreen` + `GameSettingsContext`

**Files:**
- Create: `apps/web/src/lib/game-settings-context.tsx`
- Create: `apps/web/src/components/SetupScreen.tsx`
- Create: `apps/web/src/app/index.tsx` — renders `SetupScreen`

**Interfaces:**
- Produces: `GameSettingsProvider`, `useGameSettings(): { settings: Settings | null, setSettings: (s: Settings) => void }`
  from `apps/web/src/lib/game-settings-context.tsx` — consumed by
  `SetupScreen` (this task) and `PlayScreen` (Task 4).
- Consumes: `Dataset`, `Difficulty`, `GameMode`, `Settings` types from
  `@321guess/core`; `loadDataset` from `apps/web/src/lib/dataset.ts`
  (already exists from the prior plan).

- [ ] **Step 1: Create the settings context**

```tsx
// apps/web/src/lib/game-settings-context.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Settings } from "@321guess/core";

type GameSettingsContextValue = { settings: Settings | null; setSettings: (s: Settings) => void };

const GameSettingsContext = createContext<GameSettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  return (
    <GameSettingsContext.Provider value={{ settings, setSettings }}>{children}</GameSettingsContext.Provider>
  );
}

/** Produces: { settings: Settings | null, setSettings: (s: Settings) => void }.
 * Consumed by SetupScreen (writes) and PlayScreen (reads). */
export function useGameSettings(): GameSettingsContextValue {
  const ctx = useContext(GameSettingsContext);
  if (!ctx) throw new Error("useGameSettings must be used within GameSettingsProvider");
  return ctx;
}
```

- [ ] **Step 2: Wire the provider into `_layout.tsx`**

Add alongside `AppLocaleProvider` (read the current file first — it was
last touched in Task 1, Step 2 of this plan):

```diff
+import { GameSettingsProvider } from '@/lib/game-settings-context';
...
     <AppLocaleProvider>
-      <IntlBridge>
-        ...
-      </IntlBridge>
+      <GameSettingsProvider>
+        <IntlBridge>
+          ...
+        </IntlBridge>
+      </GameSettingsProvider>
     </AppLocaleProvider>
```
(Nesting order doesn't matter here — `GameSettingsProvider` and
`IntlBridge` don't depend on each other — but keep `AppLocaleProvider`
outermost since `IntlBridge` reads it.)

- [ ] **Step 3: Port `SetupScreen.tsx`**

Original (`git show 8329015:components/SetupScreen.tsx`, full content
already fetched this session, ~250 lines with `ModeCard`, `ManualCard`,
`DailyChallengeCard`, `Chip`, and four inline SVG icon components). RN
port — `router.push` becomes `expo-router`'s `useRouter().push("/play")`,
`sessionStorage.setItem` becomes `setSettings(...)` from Step 1's
context, the four SVG icons become emoji per Global Constraints, `<input
type="checkbox">` in `Chip` becomes a `Pressable` with a checkmark glyph:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { useGameSettings } from "../lib/game-settings-context";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function SetupScreen() {
  const t = useTranslations("setup");
  const tManual = useTranslations("manual");
  const tOnline = useTranslations("online");
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
(The `/online` link target doesn't exist yet — `OnlineScreen` isn't
ported until a later plan. `router.push("/online")` will 404 inside the
app until then; this is expected and matches this plan's scope, same as
how the prior plan left `/online`'s absence unaddressed.)

- [ ] **Step 4: Wire it into the (now-recreated) `index.tsx`**

```tsx
// apps/web/src/app/index.tsx
import { SetupScreen } from "@/components/SetupScreen";

export default function HomeScreen() {
  return <SetupScreen />;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/web && npx tsc --noEmit
```
Expected: no errors now (Task 1's expected "missing index route" gap is
closed by this step).

- [ ] **Step 6: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/lib/game-settings-context.tsx apps/web/src/components/SetupScreen.tsx apps/web/src/app/index.tsx apps/web/src/app/_layout.tsx
git commit -m "Port SetupScreen to apps/web with a GameSettingsContext

Replaces the old site's sessionStorage settings bridge — unnecessary
here since Expo Router's push navigation keeps the app mounted in one JS
context, unlike the old site's real page loads between routes."
```

---

### Task 4: Port `PlayScreen`, wire `/play`

**Files:**
- Create: `apps/web/src/components/PlayScreen.tsx`
- Create: `apps/web/src/app/play.tsx`

**Interfaces:**
- Consumes: `useGameSettings` (Task 3), `Countdown` (Task 2), `RoundView`
  (prior plan), `buildPool`/`pickRound` from `@321guess/core`,
  `fetchLiveRoundPlayers`/`loadDataset` from `apps/web/src/lib/` (prior
  plan).

- [ ] **Step 1: Port `PlayScreen.tsx`**

Original (`git show 8329015:components/PlayScreen.tsx`, full content
already fetched this session). `sessionStorage.getItem` + a redirect
timer becomes reading `useGameSettings()`'s `settings` directly — if
it's `null` (user navigated to `/play` directly without going through
Setup), show the same "no settings" message, but redirect via
`router.replace("/")` (there is no timed-then-redirect UX need to
preserve exactly; immediate replace is simpler and RN navigation doesn't
have the same "flash of empty page" concern a full page load did):

```tsx
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
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

- [ ] **Step 2: Create the `/play` route**

```tsx
// apps/web/src/app/play.tsx
import { PlayScreen } from "@/components/PlayScreen";

export default function PlayRoute() {
  return <PlayScreen />;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/munurcoskun/Claude/321guess/apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Verify the web export succeeds end-to-end**

```bash
npx expo export -p web
grep -o "Oyunu Başlat\|Start Game" dist/index.html | head -1
```
Expected: the actual Turkish "Oyunu Başlat" (or English "Start Game")
button label appears in the statically-rendered home page — same
stronger-than-bundle-grep proof technique used in the prior plan.

- [ ] **Step 5: Confirm `apps/api` and `packages/core` are unaffected**

```bash
cd /Users/munurcoskun/Claude/321guess
npm test
```
Expected: 25/25 (unchanged from before this plan).

- [ ] **Step 6: Commit**

```bash
rm -rf apps/web/dist apps/web/.expo
git add apps/web/src/components/PlayScreen.tsx apps/web/src/app/play.tsx
git commit -m "Port PlayScreen to apps/web, wire /play route

Verified end-to-end: expo export -p web statically rendered the real
'Oyunu Başlat' button label into dist/index.html. This environment
cannot verify the countdown animation's actual look on a device — a
human should check /play in a real browser and, ideally, a native build."
```

---

## What's next

`OnlineScreen` (Daily Challenge) remains — the most complex screen
(timer, live guess-checking against `apps/api`, leaderboard, share card,
streaks) and the one push notifications are ultimately for. It becomes
its own plan, per the design doc's pacing. A human should click through
Setup → Play (both modes, all three difficulties) and Setup → Manual in
a real browser before that work starts, since this plan's own
verification could only confirm static rendering succeeded, not that the
actual game loop (countdown timing, round rolling, answer reveal) feels
right.
