# Mobile "Warm Arcade" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile app's flat dark-green "arena" background with a dark purple gradient, rework five key native screens (Setup/home, gameplay, Challenge hub, Challenge send, Settings) into a bigger, more game-native layout, and finally populate the club-color data the original arena design always intended to use.

**Architecture:** Purely presentational — a new shared `ArenaBackground` component (wrapping `expo-linear-gradient`) replaces every native screen's flat `bg-arena-bg` root, a new translucent value for the existing `arena-bg-soft` token makes every card/row read as glass-over-gradient for free, and five screens get their internal JSX restructured to match reviewed mockups. No new interaction mechanism, no API/data changes except running an already-written, never-executed script.

**Tech Stack:** Expo Router, React Native, NativeWind (Tailwind for RN), `expo-linear-gradient` (already a dependency, ~15.0.8), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-mobile-warm-arcade-redesign-design.md` (and its predecessor, `docs/superpowers/specs/2026-08-13-mobile-lively-design-design.md`, for the arena architecture this builds on).

## Global Constraints

- **Web is completely unaffected.** Every change in this plan lives inside `Platform.OS !== "web"` branches, native-only files, or NativeWight tokens web never references (`arena-*` tokens are not used by any web-rendered component). `tsc --noEmit` and `expo export -p web` must stay clean and byte-identical in web output after every task.
- **No functional/data/API behavior changes.** This is presentational only — no change to game rules, scoring, validation, or any API contract.
- **Copy is illustrative only.** Every mockup string in the design spec is a placeholder for the real i18n keys already in `apps/web/src/locales/{tr,en}.json`. Never invent new copy or new i18n keys unless a task explicitly says to — reuse the exact `t("...")` calls already present in the code you're editing.
- **No new sound/haptics/motion.** `ArenaPressable` (press animation + haptic + tap sound), `lib/haptics.ts`, and `GameSettingsProvider`'s toggles are reused exactly as they exist today — this plan does not touch them.
- **`expo-linear-gradient` renders a linear gradient, not the mockups' CSS `radial-gradient`.** A top-to-bottom linear gradient between the same two stops is the approved substitute — do not attempt a radial effect.

---

### Task 1: Palette tokens + shared `ArenaBackground` component

**Files:**
- Modify: `apps/web/tailwind.config.js`
- Create: `apps/web/src/components/ArenaBackground.tsx`

**Interfaces:**
- Produces: `ArenaBackground` — a component with the same `className`/`style`/`children` surface as a plain `View`, used by every later task as the drop-in replacement for `<View className="flex-1 bg-arena-bg">` (and its variants with extra classes/inline styles).

- [ ] **Step 1: Change `arena-bg-soft`'s value to a translucent white**

In `apps/web/tailwind.config.js`, find this line inside the `// Mobile-only "arena" identity` block:

```js
        "arena-bg-soft": "#153A28",
```

Replace it with:

```js
        "arena-bg-soft": "rgba(255,255,255,0.08)",
```

Leave every other `arena-*` token (`arena-bg`, `arena-accent`, `arena-accent-strong`, `arena-accent-2`, `arena-accent-2-strong`, `arena-text`, `arena-text-soft`, `arena-card`) untouched — `arena-bg` stays `"#0F2A1E"` and keeps being used as-is for small non-screen-root elements (e.g. `SetupScreen.tsx`'s icon badge, `RoundView.tsx`'s player-row background). This single-line change makes every existing `bg-arena-bg-soft` card/row across the whole app (there are dozens — `ManualScreen`, `OnlineScreen`, `ChallengeScreen`, `SettingsScreen`, `RoundView`, `RoundPlayView`, `GameSettingsPicker`, `ArenaChip`) render as a translucent glass panel over the new gradient, with zero changes needed at any of those call sites.

- [ ] **Step 2: Create the `ArenaBackground` component**

Create `apps/web/src/components/ArenaBackground.tsx`:

```tsx
import { LinearGradient } from "expo-linear-gradient";
import { View, type ViewProps } from "react-native";

type ArenaBackgroundProps = ViewProps & { children?: React.ReactNode; className?: string };

/** Root background for every native "arena" screen — a dark purple gradient
 * (top `#3A2E5C` to bottom `#1A1330`) replacing the old flat `arena-bg`
 * color. `expo-linear-gradient` only renders a linear gradient (the design
 * spec's mockups used a CSS radial-gradient); a top-to-bottom linear
 * gradient between the same two stops is the approved substitute.
 *
 * `className`/`style` land on an inner plain View, not on LinearGradient
 * itself — NativeWind doesn't auto-register className support for
 * custom-wrapped components (the same lesson ArenaPressable's doc comment
 * already records), so LinearGradient only ever carries a fixed
 * `style={{ flex: 1 }}` and every caller's layout classes apply normally
 * to the inner View. Drop-in replacement for
 * `<View className="flex-1 bg-arena-bg">` — remove `bg-arena-bg` from the
 * className when switching a call site to this component. */
export function ArenaBackground({ children, className, style, ...rest }: ArenaBackgroundProps) {
  return (
    <LinearGradient colors={["#3A2E5C", "#1A1330"]} style={{ flex: 1 }}>
      <View className={className} style={style} {...rest}>
        {children}
      </View>
    </LinearGradient>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (this component isn't used anywhere yet, so this only confirms it compiles standalone).

- [ ] **Step 4: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, same 16 routes as before, no new warnings — this task hasn't touched any web-rendered code path yet.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tailwind.config.js apps/web/src/components/ArenaBackground.tsx
git commit -m "Add warm-arcade gradient background token/component"
```

---

### Task 2: Sweep remaining screens onto the gradient background

**Files:**
- Modify: `apps/web/src/components/PlayScreen.tsx:70`
- Modify: `apps/web/src/components/ManualScreen.tsx:104`
- Modify: `apps/web/src/components/OnlineScreen.tsx:337`
- Modify: `apps/web/src/components/ChallengeScreen.tsx:279,364,370,413,540`

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1 (`import { ArenaBackground } from "./ArenaBackground";`).

This task changes ONLY the root background of screens/states not covered by their own dedicated layout task later in this plan (Setup, the Challenge hub, the Challenge send screen, and Settings each get their own task and are excluded here). Internal layout of every screen touched in this task stays exactly as it is today — only the outermost `<View className="... bg-arena-bg ...">` becomes `<ArenaBackground className="...">` with `bg-arena-bg` removed from the class list.

- [ ] **Step 1: `PlayScreen.tsx`**

Add the import at the top of the file (alongside the other component imports):

```tsx
import { ArenaBackground } from "./ArenaBackground";
```

Change line 70 from:

```tsx
      <View className="flex-1 bg-arena-bg">
```

to:

```tsx
      <ArenaBackground className="flex-1">
```

Find that same block's matching closing `</View>` (the one that closes this specific root — read the surrounding ~30 lines to find it precisely, don't guess) and change it to `</ArenaBackground>`.

- [ ] **Step 2: `ManualScreen.tsx`**

Same pattern: add the `ArenaBackground` import, change line 104's `<View className="flex-1 bg-arena-bg">` to `<ArenaBackground className="flex-1">`, and change its matching closing tag.

- [ ] **Step 3: `OnlineScreen.tsx`**

Same pattern for line 337.

- [ ] **Step 4: `ChallengeScreen.tsx` — five remaining root occurrences**

Add the `ArenaBackground` import once at the top of the file. Then, for each of these five lines, apply the same swap (remove `bg-arena-bg` from the className, change the tag to `ArenaBackground`, and update its matching closing tag):

- Line 279: `<View className="flex-1 items-center justify-center bg-arena-bg" style={{ paddingTop: insets.top }}>` → `<ArenaBackground className="flex-1 items-center justify-center" style={{ paddingTop: insets.top }}>`
- Line 364: `<View className="flex-1 items-center justify-center bg-arena-bg">` → `<ArenaBackground className="flex-1 items-center justify-center">`
- Line 370: `<View className="flex-1 bg-arena-bg">` (the `new-settings` screen wrapper) → `<ArenaBackground className="flex-1">`
- Line 413: `<View className="flex-1 bg-arena-bg">` (the `countdown` screen) → `<ArenaBackground className="flex-1">`
- Line 540: `<View className="flex-1 items-center justify-center gap-6 bg-arena-bg px-4">` → `<ArenaBackground className="flex-1 items-center justify-center gap-6 px-4">`

Do NOT touch line 287 (`hub`), line 425 (`new-playing`), line 461 (`new-send`), or line 503 (`opponent-playing`) — those are handled by Tasks 4, 5, and 6.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — none of these files' web branches (where they have one) were touched.

- [ ] **Step 7: Manual on-device spot-check**

Build and install the app on a physical device (or ask the reviewer/user to, if you don't have build access — note this in your report either way). Open Manual mode, Play mode, Daily Challenge (Online), and the Challenge hub's "new-settings" (mode-config) and "countdown" screens. Confirm each shows the new dark-purple gradient instead of the old flat green, and that nothing else changed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/PlayScreen.tsx apps/web/src/components/ManualScreen.tsx apps/web/src/components/OnlineScreen.tsx apps/web/src/components/ChallengeScreen.tsx
git commit -m "Apply the gradient background to remaining native screens"
```

---

### Task 3: Setup / home screen — Full-Bleed Hero layout

**Files:**
- Modify: `apps/web/src/components/SetupScreen.tsx:105-233` (the `Platform.OS !== "web"` branch only — the web branch below it is untouched)

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1.

**Approved layout (from the design spec):** a centered hero block near the top (icon + app name + tagline) replaces today's stacked-cards-from-the-top layout. Below it, ONE dominant primary CTA for Daily Challenge — the biggest tap target on the screen. Below that, the other two entry points render as two smaller side-by-side chips, not full-width cards.

- [ ] **Step 1: Replace the native branch's `"modes"` layout**

Read the current file first (`apps/web/src/components/SetupScreen.tsx`) to confirm line numbers haven't shifted from Tasks 1–2 (they shouldn't have — this file wasn't touched by either). Replace the whole native (`Platform.OS !== "web"`) return block, lines 105–233, with:

```tsx
  if (Platform.OS !== "web") {
    return (
      <ArenaBackground className="flex-1">
        <View className="flex-row items-center justify-end px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityLabel={tSettings("title")}
            hitSlop={12}
            className="p-2"
          >
            <Text className="text-2xl">⚙️</Text>
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
                {screen === "modes" ? (
                  <View className="flex-1 justify-center gap-8">
                    <View className="items-center gap-2">
                      <Text className="text-6xl">⚽️</Text>
                      <Text className="text-2xl font-black text-arena-text">321guess</Text>
                      <Text className="text-sm text-arena-text-soft">{t("modeGroups.daily.subtitle")}</Text>
                    </View>

                    <ArenaPressable
                      onPress={() => router.push("/online")}
                      className="items-center gap-2 rounded-3xl border-b-[8px] border-arena-accent-strong bg-arena-accent px-6 py-8"
                    >
                      <Text className="text-4xl">🏆</Text>
                      <Text className="text-xl font-black text-[#2A1E00]">{t("modeGroups.daily.title")}</Text>
                      <Text className="rounded-full bg-[#2A1E00]/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-[#2A1E00]">
                        ● {localeUpper(tOnline("modeCard.live"), locale)}
                      </Text>
                    </ArenaPressable>

                    <View className="flex-row gap-3">
                      <ArenaPressable
                        onPress={() => router.push("/challenge")}
                        className="flex-1 items-center gap-2 rounded-2xl bg-arena-bg-soft px-3 py-5"
                      >
                        <Text className="text-2xl">⚔️</Text>
                        <Text className="text-center text-sm font-bold text-arena-text">{t("modeGroups.challenge.title")}</Text>
                      </ArenaPressable>

                      <ArenaPressable
                        onPress={() => setScreen("offline-settings")}
                        className="flex-1 items-center gap-2 rounded-2xl bg-arena-bg-soft px-3 py-5"
                      >
                        <Text className="text-2xl">📱</Text>
                        <Text className="text-center text-sm font-bold text-arena-text">{t("modeGroups.offline.title")}</Text>
                      </ArenaPressable>
                    </View>
                  </View>
                ) : (
                  <View className="gap-6">
                    <Pressable onPress={() => setScreen("modes")}>
                      <Text className="text-sm tracking-wider text-arena-text-soft">← {localeUpper(t("modeGroups.offline.title"), locale)}</Text>
                    </Pressable>
                    <View className="gap-4">
                      <ArenaPressable
                        onPress={() => router.push("/manual")}
                        className="flex-row items-center gap-4 rounded-2xl border-[3px] border-dashed border-arena-bg-soft p-6"
                      >
                        <Text className="text-4xl">🔍</Text>
                        <View className="flex-1">
                          <Text className="text-lg font-bold text-arena-text">{tManual("title")}</Text>
                          <Text className="mt-1 text-base text-arena-text-soft">{tManual("description")}</Text>
                        </View>
                      </ArenaPressable>
                    </View>
                  </View>
                )}

                {screen === "offline-settings" && (
                  <GameSettingsPicker
                    mode={mode}
                    difficulty={difficulty}
                    includedLeagues={includedLeagues}
                    excludedCountries={excludedCountries}
                    onModeChange={setMode}
                    onDifficultyChange={setDifficulty}
                    onToggleLeague={toggleLeague}
                    onToggleCountry={toggleCountry}
                    onSelectAllLeagues={selectAllLeagues}
                    onClearAllLeagues={clearAllLeagues}
                    dataset={dataset}
                    clubCountries={clubCountries}
                    countriesReady={countriesReady}
                    locale={locale}
                  />
                )}
              </ScrollView>
              <ScrollFadeBottom />
            </View>

            {screen === "offline-settings" && (
              <View className="border-t border-arena-bg-soft px-4 pb-6 pt-4">
                <ArenaPressable
                  onPress={start}
                  disabled={!canStart}
                  className={`items-center rounded-2xl border-b-[6px] py-6 ${
                    canStart ? "border-arena-accent-strong bg-arena-accent" : "border-arena-bg-soft bg-arena-bg-soft"
                  }`}
                >
                  <Text className={`text-2xl font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
                    {canStart ? t("start") : t("startDisabled")}
                  </Text>
                </ArenaPressable>
              </View>
            )}
          </>
        )}
      </ArenaBackground>
    );
  }
```

This changes only the `"modes"` sub-screen's JSX (the hero + hero-CTA + two-chip row) and the root tag; the `"offline-settings"` sub-screen, the loading state, and the sticky start-button footer are unchanged from what's already there — copy this exactly, don't re-derive it, since it must stay byte-for-byte identical to the pre-existing (working, tested) code outside the `"modes"` block.

Add the import at the top of the file:

```tsx
import { ArenaBackground } from "./ArenaBackground";
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — this task only touched the `Platform.OS !== "web"` branch.

- [ ] **Step 4: Manual on-device verification**

Install on a physical device. Confirm: the hero (⚽️ emoji, "321guess", daily-challenge subtitle) appears centered near the top; the Daily Challenge CTA is the single largest tap target on the screen; "Arkadaşına Meydan Oku" and "Tek Cihazdan Oyna" render as two equal-width chips side by side below it; tapping into "Tek Cihazdan Oyna" still reaches the existing offline-settings flow (Manual mode card, mode/difficulty/league picker, sticky "Başla" footer) completely unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/SetupScreen.tsx
git commit -m "Redesign native Setup screen as a full-bleed hero layout"
```

---

### Task 4: Gameplay screen — enlarged medallions and input

**Files:**
- Modify: `apps/web/src/components/RoundPlayView.tsx`
- Modify: `apps/web/src/components/ChallengeScreen.tsx:419-456,497-530` (`new-playing` and `opponent-playing` states)

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1.
- Consumes: `LogoTile`'s existing `size?: "lg" | "sm"` prop (`apps/web/src/components/LogoTile.tsx`) — no change to `LogoTile` itself.

This is the screen both Daily Challenge (`OnlineScreen`, via its own wrapper) and Challenge Mode (`ChallengeScreen`'s `new-playing`/`opponent-playing`) share through `RoundPlayView`. Enlarging it here benefits both automatically — that's intentional, not scope creep, since it's the same shared component both already use.

- [ ] **Step 1: Enlarge `RoundPlayView`'s medallions and input**

In `apps/web/src/components/RoundPlayView.tsx`, inside the exported `RoundPlayView` function:

Change the two `LogoTile` calls (currently `size="sm"`) to `size="lg"`:

```tsx
            <LogoTile size="lg" src={question.clubA.logoUrl} alt={question.clubA.name} caption={question.clubA.name} color={question.clubA.color} />
            <Text className="text-sm font-black text-arena-text-soft">{vsLabel}</Text>
            <LogoTile size="lg" src={question.clubB.logoUrl} alt={question.clubB.name} caption={question.clubB.name} color={question.clubB.color} />
```

Change the question-card wrapper's padding from `px-4 pb-5 pt-3` to `px-4 pb-6 pt-4` (a little more breathing room around the now-larger medallions):

```tsx
      <View className="rounded-2xl bg-arena-bg-soft px-4 pb-6 pt-4">
```

In the native branch of `GuessInput` (the `if (isNative)` block), enlarge the input's text and padding from `px-4 py-4 text-lg` to `px-5 py-5 text-xl`:

```tsx
          className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-5 py-5 text-xl text-arena-text"
```

- [ ] **Step 2: Enlarge the "next question" button and switch to the gradient background in `ChallengeScreen.tsx`**

Add the `ArenaBackground` import (if Task 2 or an earlier task in this same file hasn't already added it — check first, don't duplicate the import).

For the `new-playing` block (currently lines 419–456): change `<View className="flex-1 bg-arena-bg">` to `<ArenaBackground className="flex-1">` (and its matching closing tag to `</ArenaBackground>`), and change the "→" button's padding from `py-5` to `py-6` and its text from `text-lg` to `text-xl`:

```tsx
          <ArenaPressable
            onPress={() => void goToNextPlayQuestion(challenge, finishPlaying)}
            className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
          >
            <Text className="text-xl font-bold text-[#2A1E00]">→</Text>
          </ArenaPressable>
```

Apply the identical two changes (root tag swap, button padding/text size) to the `opponent-playing` block (currently lines 497–530) — its "→" button is styled identically to `new-playing`'s.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — `RoundPlayView` and `ChallengeScreen` are both native-only in the paths touched here (confirm `RoundPlayView`'s own doc comment still says "Native-only... never rendered on web" before assuming this; if anything in this file has a web branch, do not touch it).

- [ ] **Step 5: Manual on-device verification**

Play both a Daily Challenge round and a Challenge Mode round (own-turn and opponent-turn) on a physical device. Confirm: medallions are noticeably bigger, the guess input is bigger and easier to tap into, the "→" next-question button feels as prominent as the new Setup screen's hero CTA, and the autocomplete dropdown (tap-a-suggestion-to-guess) still works exactly as before — this task does not add or remove any button; guessing still happens by tapping a suggestion, not by typing and pressing a separate submit button.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/RoundPlayView.tsx apps/web/src/components/ChallengeScreen.tsx
git commit -m "Enlarge gameplay screen medallions, input, and next-question button"
```

---

### Task 5: Challenge hub — new layout

**Files:**
- Modify: `apps/web/src/components/ChallengeScreen.tsx:285-359` (the `hub` state only)

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1.

**Approved layout:** primary CTA ("+ Yeni Meydan Okuma") in the large gold style; secondary ("🎲 Rastgele Rakip") as an *outlined* turquoise chip, not gold — the outline is what distinguishes "secondary but still an action." Section labels become small uppercase labels with letter-spacing. Empty states are soft muted boxes. Rivalry history rows show the two players' medallions overlapping slightly (avatar-stack style) — this needs each rivalry row's two club/opponent identifiers; since the current `list.completed` rows only carry `c.opponentUsername` and `c.rivalry` (no club/logo data — rivalries are cross-challenge aggregates, not tied to one match's clubs), render the overlap as two small circular initial-badges (first letter of each player's username) rather than club medallions — there is no club data available at this call site to ring-color, and inventing per-rivalry club art is out of scope.

- [ ] **Step 1: Replace the `hub` state's JSX**

Read the current file first to confirm the `hub` block's exact current line range (Tasks 1–4 didn't touch it, but confirm before editing). Replace lines 285–359 with:

```tsx
  if (screen.kind === "hub") {
    return (
      <ArenaBackground className="flex-1">
        <ScrollView className="flex-1 px-4" contentContainerClassName="gap-8 pb-10" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => router.push("/")}>
            <Text className="text-sm tracking-wider text-arena-text-soft">← {t("back")}</Text>
          </Pressable>

          <Text className="text-3xl font-black text-arena-text">{t("title")}</Text>

          <View className="gap-3">
            <ArenaPressable
              onPress={() => setScreen({ kind: "new-settings" })}
              className="items-center rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-6"
            >
              <Text className="text-xl font-bold text-[#2A1E00]">{t("newChallenge")}</Text>
            </ArenaPressable>
            <ArenaPressable
              onPress={() => void startRandomOpponent()}
              className="items-center rounded-2xl border-2 border-arena-accent-2 py-5"
            >
              <Text className="text-lg font-bold text-arena-accent-2">{t("randomOpponent")}</Text>
            </ArenaPressable>
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">{t("incomingHeading")}</Text>
            {!list || list.incoming.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyIncoming")}</Text>
            ) : (
              list.incoming.map((c) => (
                <ArenaPressable
                  key={c.id}
                  onPress={() => openIncomingChallenge(c)}
                  className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4"
                >
                  <Text className="text-base font-semibold text-arena-text">{c.mode}</Text>
                  <Text className="font-bold text-arena-accent">{t("playNow")}</Text>
                </ArenaPressable>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">{t("outgoingHeading")}</Text>
            {!list || list.outgoing.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyOutgoing")}</Text>
            ) : (
              list.outgoing.map((c) => (
                <View key={c.id} className="rounded-2xl bg-arena-bg-soft p-4">
                  <Text className="text-base font-semibold text-arena-text">{t("waitingForOpponent")}</Text>
                </View>
              ))
            )}
          </View>

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-arena-text-soft">{t("rivalriesHeading")}</Text>
            {!list || list.completed.length === 0 ? (
              <Text className="rounded-2xl bg-arena-bg-soft p-4 text-arena-text-soft">{t("emptyRivalries")}</Text>
            ) : (
              list.completed.map((c) => (
                <View key={c.id} className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft p-4">
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row">
                      <View className="h-9 w-9 items-center justify-center rounded-full border-2 border-arena-bg bg-arena-accent">
                        <Text className="text-xs font-black text-[#2A1E00]">{c.opponentUsername?.[0]?.toUpperCase() ?? "?"}</Text>
                      </View>
                    </View>
                    <Text className="text-base font-semibold text-arena-text">{c.opponentUsername}</Text>
                  </View>
                  <Text className="font-bold text-arena-accent-2">
                    {t("rivalryScore", { wins: c.rivalry.myWins, losses: c.rivalry.opponentWins })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ArenaBackground>
    );
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — `ChallengeScreen` is native-only (confirm this is still true before assuming it).

- [ ] **Step 4: Manual on-device verification**

Open the Challenge hub on a physical device with at least one rivalry in history (use the branch's existing test data or create one). Confirm: "+ Yeni Meydan Okuma" is the prominent gold action, "🎲 Rastgele Rakip" reads as a secondary outlined action, section labels are small uppercase text, empty-state boxes are visibly distinct panels (not bare text), and rivalry rows show an initial-badge circle next to the opponent's name and score.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ChallengeScreen.tsx
git commit -m "Redesign the Challenge Mode hub screen layout"
```

---

### Task 6: Challenge send screen — new layout + missing back button

**Files:**
- Modify: `apps/web/src/components/ChallengeScreen.tsx:458-495` (the `new-send` state only)

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1.

**Approved layout:** search input matches other screens' input styling; a found match renders as a row with a circular avatar-initial badge; the send action is a large gold button pinned as a sticky footer. This also closes a confirmed real gap: this screen currently has no way back except the OS's edge-swipe gesture — add the same `← {t("back")}` pattern the hub screen already uses, going back to the hub (matching the `result` screen's existing "back to hub" behavior).

- [ ] **Step 1: Replace the `new-send` state's JSX**

Read the current file first to confirm the exact current line range for this block (it will have shifted from its original 458–495 after Tasks 2, 4, and 5's edits earlier in this same file — locate it by its `screen.kind === "new-send"` condition, don't assume the line numbers). Replace it with:

```tsx
  if (screen.kind === "new-send") {
    const { challenge, result } = screen;
    return (
      <ArenaBackground className="flex-1 px-4" style={{ paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => setScreen({ kind: "hub" })}>
          <Text className="text-sm tracking-wider text-arena-text-soft">← {t("back")}</Text>
        </Pressable>

        <Text className="mt-6 text-2xl font-black text-arena-text">{t("sendHeading")}</Text>
        <Text className="mt-2 text-lg text-arena-accent-2">
          {t("sendScoreLabel", { correct: result.correctCount, total: result.totalPossible })}
        </Text>

        {/* Username search + send is the only delivery option: the former
            "generate a link" flow produced https://www.321guess.com/challenge/<id>,
            a URL with no matching route and no deep-link handling. */}
        {sendStatus === "sent" ? (
          <Text className="mt-8 text-lg text-arena-accent-2">{t("sentSuccess")}</Text>
        ) : (
          <View className="mt-8 flex-1 gap-3">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("searchPlaceholder")}
              placeholderTextColor="#8FE8C4"
              autoCapitalize="none"
              className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-5 py-5 text-xl text-arena-text"
            />
            {searchResults.map((username) => (
              <Pressable
                key={username}
                onPress={() => void sendToUsername(challenge, username)}
                className="flex-row items-center gap-3 rounded-2xl bg-arena-bg-soft px-4 py-3"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-arena-accent">
                  <Text className="text-base font-black text-[#2A1E00]">{username[0]?.toUpperCase() ?? "?"}</Text>
                </View>
                <Text className="text-lg text-arena-text">{username}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ArenaBackground>
    );
  }
```

Note the `sendStatus === "sent"` and `searchResults.map(...)` branches are otherwise unchanged in behavior — only their styling and the added avatar badge are new; do not alter `sendToUsername`, `searchQuery`/`setSearchQuery`, or any other logic in this block.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output.

- [ ] **Step 4: Manual on-device verification**

Reach the send screen on a physical device (play a Challenge Mode round through to the send step). Confirm: a "← {back label}" row now appears at the top and tapping it returns to the hub (not just the OS edge-swipe gesture); searching a username shows results with a circular initial badge; sending still works exactly as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ChallengeScreen.tsx
git commit -m "Redesign the Challenge send screen and add its missing back button"
```

---

### Task 7: Settings screen — row layout + account-linking card

**Files:**
- Modify: `apps/web/src/components/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `ArenaBackground` from Task 1.

**Approved layout:** each setting (language, sound, haptics) becomes one full-width translucent row with icon+label left, control right. The account-linking section gets a visually distinct gold-tinted card, separating it from the plain settings rows as a special/optional feature.

- [ ] **Step 1: Switch the root to `ArenaBackground` and add icons to each settings row**

In `apps/web/src/components/SettingsScreen.tsx`, add the import:

```tsx
import { ArenaBackground } from './ArenaBackground';
```

Change the root `<View>` (currently `<View className="flex-1 bg-arena-bg px-4 pb-8" style={{ paddingTop: insets.top + 32 }}>`) to:

```tsx
    <ArenaBackground className="flex-1 px-4 pb-8" style={{ paddingTop: insets.top + 32 }}>
```

...and its matching closing tag to `</ArenaBackground>`.

Update the three `SettingsRow` call sites to include an icon prefix in the label area — change:

```tsx
        <SettingsRow label={t('language')}>
```

to pass an icon alongside the label. Rather than changing `SettingsRow`'s signature (which would ripple into every call site), prefix the label string itself isn't right either (i18n strings shouldn't carry emoji baked in). Instead, extend `SettingsRow` to accept an optional `icon` prop:

```tsx
function SettingsRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-arena-bg-soft px-4 py-4">
      <View className="flex-row items-center gap-3">
        <Text className="text-lg">{icon}</Text>
        <Text className="text-sm font-semibold text-arena-text">{label}</Text>
      </View>
      {children}
    </View>
  );
}
```

(This replaces the current `SettingsRow` definition, which has a bottom-border style and no icon — the new one is a self-contained translucent row instead, matching the redesign's row style used elsewhere.)

Update the three call sites to pass an icon and wrap them with spacing (since rows are no longer separated by a border, use a `gap-2` container instead — change the wrapping `<View className="mt-8 gap-1">` to `<View className="mt-8 gap-2">`):

```tsx
        <SettingsRow icon="🌐" label={t('language')}>
          ...unchanged...
        </SettingsRow>

        <SettingsRow icon="🔊" label={t('sound')}>
          <Toggle value={soundEnabled} onChange={setSoundEnabled} />
        </SettingsRow>

        <SettingsRow icon="📳" label={t('haptics')}>
          <Toggle value={hapticsEnabled} onChange={setHapticsEnabled} />
        </SettingsRow>
```

- [ ] **Step 2: Give the account-linking section a gold-tinted card**

Change the account-linking section's wrapping `<View className="mt-8 gap-3">` (the one containing `t('accountLinking.heading')`) to:

```tsx
      <View className="mt-8 gap-3 rounded-2xl border-2 border-arena-accent/40 bg-arena-accent/10 p-4">
```

Every child inside that section (heading, description, the linked-status text, the Google/Apple/email buttons, status messages) is otherwise unchanged — only the wrapping container gains the gold-tinted border/background.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — `SettingsScreen` is native-only (confirm before assuming).

- [ ] **Step 5: Manual on-device verification**

Open Settings on a physical device. Confirm: language/sound/haptics each render as a distinct translucent row with an icon; the account-linking section is visually set apart with a gold-tinted border; every existing control (language switch, sound/haptics toggles, Google/Apple/email linking buttons, privacy/terms links) still works exactly as before.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SettingsScreen.tsx
git commit -m "Redesign Settings screen rows and account-linking card"
```

---

### Task 8: Populate club colors (finally run the existing extraction script)

**Files:**
- Modify (data only, via script): `apps/api/public/data/clubs.json`

**Interfaces:**
- Consumes: `apps/api/scripts/extract-club-colors.ts` (already written, never executed), `apps/api/scripts/color-extract.ts`'s `clampForRing` (already written and already unit-tested in `apps/api/scripts/color-extract.test.ts`).

This closes a gap from the *original* arena spec (2026-08-13), which specified this feature but it was never run.

- [ ] **Step 1: Confirm the existing test still passes**

Run: `cd apps/api && npx vitest run scripts/color-extract.test.ts`
Expected: PASS (this test doesn't hit the network — it exercises `clampForRing` in isolation — confirm it still passes before running the real network script against it).

- [ ] **Step 2: Run the extraction script for real**

Run: `cd apps/api && npm run extract-club-colors`

This fetches every club's logo over the network (with retries and a 200ms delay between requests) and writes a `color` field into `apps/api/public/data/clubs.json` in place. Expect this to take several minutes (roughly 369 clubs × ~200ms+ per request). Watch its progress output (`  N/369  updated:X  failed:Y`) and its final summary line.

- [ ] **Step 3: Verify the result**

Run: `cd apps/api && node -e "const clubs = require('./public/data/clubs.json'); const withColor = clubs.filter(c => c.color); console.log(withColor.length + '/' + clubs.length + ' clubs have a color'); console.log(withColor[0]);"`

Expected: a high proportion of clubs (not necessarily all — the script's own doc comment notes some logos can fail to fetch/decode) have a `color` field that looks like a hex string (e.g. `"#a1b2c3"`), and the printed example club has a plausible ring color for its crest.

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/api && npx vitest run`
Expected: all tests pass (33+ tests from before this plan, unaffected by a pure data-file change).

- [ ] **Step 5: Verify web is unaffected**

Run: `cd apps/web && npx expo export -p web`
Expected: succeeds, byte-identical web output — `clubs.json`'s new `color` field is only read by native's `LogoTile` (`Platform.OS !== "web"` branch); web's `LogoTile` branch never reads `color` at all (confirm this by re-reading `apps/web/src/components/LogoTile.tsx`'s web branch before assuming it).

- [ ] **Step 6: Manual on-device verification**

Play any mode with club-vs-club matchups on a physical device (Manual, Play, Daily Challenge, or Challenge Mode all use the same `LogoTile`). Confirm: medallions for different clubs now show different ring colors matching each club's own crest, instead of every medallion sharing the same neutral green ring.

- [ ] **Step 7: Commit**

```bash
git add apps/api/public/data/clubs.json
git commit -m "Populate club ring colors via extract-club-colors.ts"
```

---

## Final Verification (whole-plan regression)

After all 8 tasks are complete:

1. `cd apps/web && npx tsc --noEmit` — clean.
2. `cd apps/api && npx tsc --noEmit` — clean (untouched by this plan, but confirm no incidental breakage).
3. `cd apps/api && npx vitest run` — all tests pass.
4. `cd apps/web && npx expo export -p web` — succeeds, output byte-identical to this plan's starting point for every existing route.
5. Full manual on-device pass covering every screen this plan touched (Setup, gameplay in both Daily Challenge and Challenge Mode, Challenge hub, Challenge send, Settings) plus every screen that only got the background swap (Manual, Play, Challenge's new-settings/countdown/result), confirming nothing outside this plan's stated scope changed.
