# Port ManualScreen to apps/web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (executed directly this session, no subagent dispatch — see Global Constraints). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the simplest real screen (`ManualScreen` — pick two clubs,
see who played for both) from the old Next.js website into `apps/web`,
proving the full stack (styling, i18n, data loading, live API calls)
works end-to-end on a real screen before tackling anything bigger.

**Architecture:** NativeWind (Tailwind on React Native, same v3-syntax
config as the old site) for styling; `use-intl` (next-intl's
framework-agnostic core — no Next.js dependency, same JSON message files,
same ICU plural syntax already in `locales/*.json`) for i18n; `packages/core`'s
`loadDataset(baseUrl)` for the club/country/player dataset, pointed at
`apps/api`; a small local component library
(`LogoTile`, `ThemeToggle`, `LanguageSwitcher`, `RoundView`) ported to RN
primitives, then `ManualScreen` itself.

**Tech Stack:** NativeWind 4, Tailwind CSS 3 (matches `nativewind@4.2.6`'s
`tailwindcss > 3.3.0` peer requirement), `use-intl`, `@321guess/core`.

## Global Constraints

- No subagent dispatch — direct execution, one task at a time, commit
  after each. Never run `git reset --hard`, `git checkout -- .`, or
  `git clean` (see the incident documented in the prior plan's Global
  Constraints — still binding).
- This environment has no iOS Simulator or Android emulator (Xcode
  Command Line Tools only, no `simctl`; no `adb`). Every task's
  verification is: TypeScript compiles, `npx expo export -p web`
  succeeds, and the exported bundle contains the expected strings (grep
  the output — same technique used to verify Task 3 of the prior plan).
  Do not claim native-platform verification that didn't happen.
- Source material for every ported file is retrieved from git history at
  commit `8329015` (the last commit before the old site was deleted) via
  `git show 8329015:<path>` — already fetched once this session; the
  exact content each task starts from is included in that task's steps,
  not re-fetched.
- `apps/web` needs to know where to reach `apps/api` for data. Use an
  `EXPO_PUBLIC_API_URL` environment variable (Expo's convention for
  client-exposed env vars — the `EXPO_PUBLIC_` prefix is required for a
  var to reach client code, same purpose as Next.js's old
  `NEXT_PUBLIC_` convention). For local development this plan hardcodes
  `http://localhost:3000` as the fallback default (apps/api's dev
  server port) — production wiring to `api.321guess.com` is deployment
  configuration, out of scope for this plan.
- Preserve every design token from the old `tailwind.config.ts` /
  `app/globals.css` (paper/ink/accent color scale, light+dark themes) —
  do not invent new colors.
- `components/OnlineScreen.tsx`, `SetupScreen.tsx`, `PlayScreen.tsx`,
  `Countdown.tsx` are explicitly OUT of scope — only the files
  `ManualScreen` actually imports are ported here.

---

### Task 1: NativeWind + Tailwind setup in `apps/web`

**Files:**
- Create: `apps/web/tailwind.config.js`
- Create: `apps/web/global.css` (replaces the template's existing
  `src/global.css` reference — check `src/app/_layout.tsx`'s import
  after this task and update it if needed)
- Modify: `apps/web/metro.config.js` (new file — NativeWind needs a
  `withNativeWind` wrapper; the template has no metro.config.js today,
  confirmed via `find . -maxdepth 1 -iname "metro*"` returning nothing
  when this plan's predecessor scaffolded the project)
- Modify: `apps/web/babel.config.js` (new file — NativeWind's Babel
  preset; the template also has none today, Expo's default Babel config
  is implicit)
- Modify: `apps/web/package.json` — add `nativewind`, `tailwindcss` deps

**Interfaces:**
- Produces: a `className` prop usable on any RN component
  (`<View className="bg-paper" />`), resolving the same color tokens the
  old site used (`paper`, `paper-2`, `ink`, `ink-soft`, `ink-mute`,
  `rule`, `accent`, `accent-strong`) plus the `fade-in` animation.

- [ ] **Step 1: Install NativeWind and Tailwind**

```bash
cd /Users/munurcoskun/Claude/321guess
npm install --workspace apps/web nativewind@^4.2.6 tailwindcss@^3.4.17
npm install --workspace apps/web --save-dev react-native-css-interop
```
(`react-native-css-interop` may already be pulled in transitively by
`nativewind` — check `apps/web/node_modules/react-native-css-interop`
exists after this step before adding it explicitly a second time.)

- [ ] **Step 2: Create `apps/web/tailwind.config.js`**

Ports the color tokens and animations from the old
`tailwind.config.ts` (fetched via `git show 8329015:tailwind.config.ts`
this session) — same values, NativeWind's `content` globs point at
`src/` instead of `app/`+`components/`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
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
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Replace `src/global.css` with the ported theme tokens**

Content ported from `app/globals.css` (fetched via
`git show 8329015:app/globals.css` this session), dropping the
`@tailwind` directives (NativeWind's preset injects those itself) and
the `body`/`html` rules (no DOM `<body>` in RN — NativeWind's root View
handles background instead, wired in Task 5's layout work):

```css
:root {
  --paper: 246 242 234;
  --paper-2: 237 232 220;
  --ink: 30 28 25;
  --ink-soft: 74 70 64;
  --ink-mute: 122 116 106;
  --rule: 217 211 196;
  --accent: 63 107 86;
  --accent-strong: 47 84 67;
}

.dark {
  --paper: 20 19 15;
  --paper-2: 30 28 23;
  --ink: 232 226 211;
  --ink-soft: 184 176 160;
  --ink-mute: 138 132 120;
  --rule: 58 53 43;
  --accent: 108 163 136;
  --accent-strong: 85 135 111;
}
```
(NativeWind's `darkMode: "class"` toggles via a `.dark` class on the
root — simpler than the old site's `data-theme` attribute + media-query
fallback combo. `ThemeToggle`'s port in Task 3 sets this class.)

- [ ] **Step 4: Create `apps/web/metro.config.js`**

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
```

- [ ] **Step 5: Create `apps/web/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
```

- [ ] **Step 6: Update `src/app/_layout.tsx`'s CSS import**

Read the current import line (the template imports `../global.css` or
similar — check first with `grep -n "global.css" apps/web/src/app/_layout.tsx`)
and confirm it already points at `src/global.css` (Step 3 replaced that
file's content, not its path, so this import likely needs no change —
verify rather than assume).

- [ ] **Step 7: Verify with a throwaway styled probe**

Temporarily add `className="bg-accent"` to the outermost `ThemedView` in
`src/app/index.tsx`, run:
```bash
cd apps/web && npx expo export -p web
grep -o "background-color:#3f6b56\|#3f6b56" dist/_expo/static/css/*.css
```
Expected: the accent color's hex (`#3f6b56` — `rgb(63 107 86)`) appears
in the exported CSS, confirming NativeWind resolved the custom color
token. Revert the temporary `className` afterward
(`git checkout -- apps/web/src/app/index.tsx`).

- [ ] **Step 8: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/tailwind.config.js apps/web/metro.config.js apps/web/babel.config.js apps/web/src/global.css apps/web/package.json package-lock.json
git status --short  # confirm src/app/index.tsx is NOT staged (probe reverted)
git commit -m "Add NativeWind + Tailwind to apps/web, porting the old site's color tokens"
```

---

### Task 2: i18n with `use-intl`

**Files:**
- Create: `apps/web/src/locales/en.json`, `apps/web/src/locales/tr.json`
- Create: `apps/web/src/i18n/messages.ts`
- Create: `apps/web/src/i18n/AppLocaleContext.tsx`
- Modify: `apps/web/src/app/_layout.tsx` — wrap the app in
  `AppLocaleProvider` + `IntlProvider`
- Modify: `apps/web/package.json` — add `use-intl`

**Interfaces:**
- Produces: `useTranslations(namespace)` and `useLocale()` hooks,
  imported from `use-intl` directly in every ported component (same
  call signatures the old `next-intl`-based components already used —
  `use-intl` is next-intl's underlying, framework-agnostic runtime, so
  the hook API is identical).
- Produces: `useAppLocale(): { locale: AppLocale, setLocale: (locale: AppLocale) => void }`
  from `apps/web/src/i18n/AppLocaleContext.tsx` — consumed by
  `LanguageSwitcher` (Task 3, Step 3).

- [ ] **Step 1: Install `use-intl`**

```bash
cd /Users/munurcoskun/Claude/321guess
npm install --workspace apps/web use-intl@^4.13.6
```

- [ ] **Step 2: Copy the message catalogs**

Full content fetched from `git show 8329015:locales/en.json` and
`git show 8329015:locales/tr.json` this session (already read in full
earlier in this conversation — includes `meta`, `home`, `setup`, `play`,
`language`, `manual`, `online` namespaces). Copy verbatim into
`apps/web/src/locales/en.json` and `apps/web/src/locales/tr.json` —
`ManualScreen` only needs `manual`, `play`, and `language`, but copying
the full file now avoids a second porting pass when later screens need
the rest.

- [ ] **Step 3: Create the locale catalog + a `useAppLocale` context hook**

`use-intl` has no built-in "current locale" state management (that's
`next-intl`'s routing-integration layer, which we're not using) — so
this app owns a small locale context itself, exporting exactly one hook
(`useAppLocale`) that both `_layout.tsx` (Step 4, to get the provider's
`locale`/`messages`) and `LanguageSwitcher` (Task 3) call:

```typescript
// apps/web/src/i18n/messages.ts
import en from "../locales/en.json";
import tr from "../locales/tr.json";

export const messages = { en, tr } as const;
export type AppLocale = keyof typeof messages;
export const defaultLocale: AppLocale = "tr";
```

```tsx
// apps/web/src/i18n/AppLocaleContext.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultLocale, type AppLocale } from "./messages";

type AppLocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void };

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);
  return (
    <AppLocaleContext.Provider value={{ locale, setLocale }}>{children}</AppLocaleContext.Provider>
  );
}

/** Produces: { locale: AppLocale, setLocale: (locale: AppLocale) => void }.
 * Consumed by _layout.tsx (Step 4) and LanguageSwitcher (Task 3, Step 3). */
export function useAppLocale(): AppLocaleContextValue {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) throw new Error("useAppLocale must be used within AppLocaleProvider");
  return ctx;
}
```

- [ ] **Step 4: Wrap the app in `AppLocaleProvider` + `IntlProvider`**

Read `apps/web/src/app/_layout.tsx` first to see its current structure
(the template's root layout — fetch its current content with `cat` since
this file didn't exist before this plan). `AppLocaleProvider` must wrap
`IntlProvider` (the inner provider reads `useAppLocale()`), which in turn
wraps the existing tree:

```tsx
// apps/web/src/app/_layout.tsx — add these imports and a new inner component
import { AppLocaleProvider, useAppLocale } from "@/i18n/AppLocaleContext";
import { IntlProvider } from "use-intl";
import { messages } from "@/i18n/messages";

function IntlBridge({ children }: { children: React.ReactNode }) {
  const { locale } = useAppLocale();
  return (
    <IntlProvider locale={locale} messages={messages[locale]} timeZone="Europe/Istanbul">
      {children}
    </IntlProvider>
  );
}

// Wrap the existing default-exported layout's returned tree with:
// <AppLocaleProvider><IntlBridge>{...existing tree...}</IntlBridge></AppLocaleProvider>
```

- [ ] **Step 5: Verify a translated string renders**

Temporarily render `useTranslations("language")("tr")` (expected value:
`"Türkçe"`) somewhere in `src/app/index.tsx`, run
`npx expo export -p web`, `grep -c "Türkçe" dist/_expo/static/js/web/entry-*.js`
(expect ≥1), then revert the probe.

- [ ] **Step 6: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/locales apps/web/src/i18n apps/web/src/app/_layout.tsx apps/web/package.json package-lock.json
git status --short  # confirm src/i18n/messages.ts AND src/i18n/AppLocaleContext.tsx are both staged
git commit -m "Add use-intl i18n to apps/web, porting the old site's message catalogs"
```

---

### Task 3: Port `LogoTile`, `ThemeToggle`, `LanguageSwitcher`

**Files:**
- Create: `apps/web/src/components/LogoTile.tsx`
- Create: `apps/web/src/components/ThemeToggle.tsx`
- Create: `apps/web/src/components/LanguageSwitcher.tsx`

**Interfaces:**
- Produces: `LogoTile({ src, alt, caption, variant?, size? })` — same
  prop shape as the old component (`src/components/RoundView.tsx` in
  Task 4 consumes this directly, unchanged prop names).
- Produces: `ThemeToggle()` — no props, toggles `.dark` class on the
  NativeWind root (RN has no `document.documentElement`; NativeWind
  exposes `useColorScheme()` from `nativewind` for this instead).
- Produces: `LanguageSwitcher()` — no props in the original, but the RN
  port needs the `setLocale` callback from Task 2's provider (no
  `next/navigation` router to read/write a URL locale segment from,
  since this app has no locale-prefixed routes) — accepts it via a
  small context (same one `_layout.tsx` set up in Task 2 Step 4) rather
  than a prop, to keep the call site (Task 5) identical to the original.

- [ ] **Step 1: Port `LogoTile.tsx`**

Original (`git show 8329015:components/LogoTile.tsx`, already fetched
this session) used a `<div>`+`<img>` with Tailwind classes. RN port:

```tsx
import { Image, View, Text } from "react-native";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
  size?: "lg" | "sm";
};

export function LogoTile({ src, alt, caption, variant = "logo", size = "lg" }: LogoTileProps) {
  const isSmall = size === "sm";
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
        className={`text-center font-medium text-ink-soft ${
          isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
        }`}
      >
        {caption}
      </Text>
    </View>
  );
}
```
(Shadow/elevation styling and the exact responsive `sm:`/`lg:` breakpoint
variants from the original are dropped for this first port — RN has no
hover/pointer-driven layout needs, and responsive breakpoints matter far
less on a single-device screen; revisit only if the rendered result
looks wrong when a human checks it in a browser.)

- [ ] **Step 2: Port `ThemeToggle.tsx`**

```tsx
import { Pressable, Text } from "react-native";
import { useColorScheme } from "nativewind";

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  return (
    <Pressable
      onPress={toggleColorScheme}
      accessibilityLabel={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-ink/5"
    >
      <Text className="text-ink-soft">{colorScheme === "dark" ? "☀️" : "🌙"}</Text>
    </Pressable>
  );
}
```
(Swapped the original's inline SVG icons for emoji — RN has no inline
SVG without an extra dependency (`react-native-svg`), and this plan's
scope is proving the port works, not pixel-perfect icon fidelity. Revisit
with `react-native-svg` in a later polish pass if the human wants the
exact original icons.)

- [ ] **Step 3: Port `LanguageSwitcher.tsx`**

Needs `useAppLocale()` from Task 2, Step 3
(`apps/web/src/i18n/AppLocaleContext.tsx`), which returns
`{ locale: AppLocale, setLocale: (locale: AppLocale) => void }`:

```tsx
import { Pressable, Text, View } from "react-native";
import { useTranslations } from "use-intl";
import { messages } from "@/i18n/messages";
import { useAppLocale } from "@/i18n/AppLocaleContext";

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const { locale, setLocale } = useAppLocale();
  const locales = Object.keys(messages) as (keyof typeof messages)[];

  return (
    <View className="flex-row gap-1 rounded-full border border-ink/10 bg-ink/5 p-1">
      {locales.map((l) => (
        <Pressable
          key={l}
          onPress={() => setLocale(l)}
          className={`rounded-full px-3 py-1 ${locale === l ? "bg-accent" : ""}`}
        >
          <Text className={locale === l ? "font-semibold text-paper" : "text-ink-soft"}>
            {t(l)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors (these three components aren't imported anywhere
yet, but they must still type-check standalone).

- [ ] **Step 5: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/components/LogoTile.tsx apps/web/src/components/ThemeToggle.tsx apps/web/src/components/LanguageSwitcher.tsx
git commit -m "Port LogoTile, ThemeToggle, LanguageSwitcher to apps/web"
```

---

### Task 4: Port `RoundView`

**Files:**
- Create: `apps/web/src/components/RoundView.tsx`

**Interfaces:**
- Consumes: `LogoTile` (Task 3), `Round`/`ClubClubRound`/`CountryClubRound`
  types from `@321guess/core` (Task 1 of the prior plan already exports
  these).
- Produces: `RoundView({ round, onNext })` — same prop shape as the
  original (`ManualScreen`'s Task 5 port calls this unchanged).

- [ ] **Step 1: Port the component**

Original fetched via `git show 8329015:components/RoundView.tsx` this
session (full content already retrieved above). RN port:

```tsx
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Round } from "@321guess/core";
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/components/RoundView.tsx
git commit -m "Port RoundView to apps/web"
```

---

### Task 5: Port `ManualScreen` and wire it to `apps/api`

**Files:**
- Create: `apps/web/src/lib/live-players.ts`
- Create: `apps/web/src/lib/dataset.ts` (thin wrapper calling
  `@321guess/core`'s `loadDataset` with the configured API base URL)
- Create: `apps/web/src/components/ManualScreen.tsx`
- Modify: `apps/web/src/app/index.tsx` — render `ManualScreen` instead
  of the template's demo content
- Modify: `apps/web/.env.example` (new file) — document
  `EXPO_PUBLIC_API_URL`

**Interfaces:**
- Consumes: `loadDataset` from `@321guess/core` (prior plan), `RoundView`
  (Task 4), `LanguageSwitcher`/`ThemeToggle` (Task 3), `useTranslations`/
  `useLocale` from `use-intl` (Task 2).

- [ ] **Step 1: Create the API base URL helper**

```typescript
// apps/web/src/lib/api-base-url.ts
export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
}
```

- [ ] **Step 2: Port `live-players.ts`**

Original fetched via `git show 8329015:lib/live-players.ts` (full
content already retrieved above), pointed at the configured API origin
instead of a same-origin relative path:

```typescript
// apps/web/src/lib/live-players.ts
import type { Player, Round } from "@321guess/core";
import { apiBaseUrl } from "./api-base-url";

export async function fetchLiveRoundPlayers(round: Round, signal?: AbortSignal): Promise<Player[] | null> {
  const body =
    round.kind === "clubClub"
      ? { mode: "clubClub", clubA: round.clubA.id, clubB: round.clubB.id }
      : { mode: "countryClub", club: round.club.id, countryCode: round.country.code };
  try {
    const res = await fetch(`${apiBaseUrl()}/api/round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { players?: Player[] };
    return Array.isArray(data.players) ? data.players : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Create the dataset loader wrapper**

```typescript
// apps/web/src/lib/dataset.ts
import { loadDataset as loadDatasetCore } from "@321guess/core";
import { apiBaseUrl } from "./api-base-url";

export function loadDataset() {
  return loadDatasetCore(apiBaseUrl());
}
```

- [ ] **Step 4: Port `ManualScreen.tsx`**

Original fetched via `git show 8329015:components/ManualScreen.tsx`
(full content already retrieved earlier this session). This is the
largest port in the plan — the `SearchBox` dropdown is rebuilt using
RN's `TextInput` + a conditionally-rendered `View` list (no
`onMouseDown`/`onBlur` timing hack; RN's `Pressable` handles tap-to-select
without the web's blur-races-click problem):

```tsx
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Club, Country, Dataset, GameMode, Round } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { fetchLiveRoundPlayers } from "../lib/live-players";
import { RoundView } from "./RoundView";
import { LanguageSwitcher } from "./LanguageSwitcher";
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
              <Pressable onPress={reset} className="rounded-xl border border-rule px-4 justify-center">
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
  emptyText: string;
};

function SearchBox<T>({ label, selected, onChange, items, getKey, getLabel, getSubtitle, emptyText }: SearchBoxProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items.slice(0, 30);
    return items.filter((item) => normalize(getLabel(item)).includes(q)).slice(0, 40);
  }, [query, items, getLabel]);

  if (selected) {
    return (
      <View className="rounded-xl border-2 border-accent bg-accent/10 p-3">
        <Text className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">{label}</Text>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-base font-semibold">{getLabel(selected)}</Text>
            <Text className="text-xs text-ink-mute">{getSubtitle(selected)}</Text>
          </View>
          <Pressable onPress={() => { onChange(null); setQuery(""); }} className="rounded-md px-2 py-1">
            <Text className="text-xs text-ink-mute">✕</Text>
          </Pressable>
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
                  onPress={() => { onChange(item); setQuery(""); setOpen(false); }}
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
(Dropped the original's `onBlur`-with-150ms-delay hack for closing the
list on outside click — that was specifically working around a web
mouseevent race; simplest RN-safe equivalent is closing on selection
only for this first port. A human should check in-browser whether
leaving the dropdown open until a selection is made feels acceptable, or
whether an outside-tap-to-close needs adding back.)

- [ ] **Step 5: Wire it into the home screen**

Replace `src/app/index.tsx`'s content with:
```tsx
import { ManualScreen } from "@/components/ManualScreen";

export default function HomeScreen() {
  return <ManualScreen />;
}
```
(This discards the template's demo tabs/hero content — acceptable, this
plan's whole point is replacing the placeholder with the real screen.
`src/app/explore.tsx` and the tab bar (`app-tabs.tsx`) still exist and
still work; leaving `explore` as a second tab pointing at template demo
content is fine for now, not this plan's concern.)

- [ ] **Step 6: Create `apps/web/.env.example`**

```
# Base URL apps/web uses to reach apps/api. EXPO_PUBLIC_ prefix required
# for Expo to expose this to client code (same purpose as Next.js's old
# NEXT_PUBLIC_ convention). Defaults to http://localhost:3000 in code if
# unset — this file exists for documentation and production overrides.
EXPO_PUBLIC_API_URL=http://localhost:3000
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 8: Verify the web export succeeds and contains expected content**

```bash
npx expo export -p web
grep -c "manual\." dist/_expo/static/js/web/entry-*.js  # sanity: bundle isn't empty of our code
```
(A literal `grep -c "ManualScreen"` won't match — component names don't
survive minification. Confirming the bundle grew substantially and the
export succeeded is the real signal; also re-check
`ls dist/_expo/static/js/web/entry-*.js` file size is meaningfully
larger than the prior plan's ~2.1MB baseline, confirming the new code
was actually included.)

- [ ] **Step 9: Confirm `apps/api`, `apps/web`, `packages/core` all still pass their own checks**

```bash
cd /Users/munurcoskun/Claude/321guess
npm test          # 25/25, unaffected by apps/web changes
cd apps/api && npx tsc --noEmit && echo API_OK
cd ../../packages/core && npx vitest run && echo CORE_OK
```

- [ ] **Step 10: Commit**

```bash
cd /Users/munurcoskun/Claude/321guess
git add apps/web/src/lib apps/web/src/components/ManualScreen.tsx apps/web/src/app/index.tsx apps/web/.env.example
git commit -m "Port ManualScreen to apps/web, wired to apps/api for live player data"
```

---

## What's next

This plan does not touch `SetupScreen`, `PlayScreen`, `Countdown`, or
`OnlineScreen` — those become their own follow-up plans, per the
design doc's "screen by screen" pacing. Once a human has verified
`ManualScreen` actually looks and behaves correctly in a real browser
(this environment can only confirm it builds and bundles, not that it
renders/behaves correctly — no visual verification was possible here),
the next plan should tackle whichever screen the human prioritizes next.
