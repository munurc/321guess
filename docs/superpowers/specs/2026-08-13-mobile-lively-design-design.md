# Mobile "Arena" Design Pass

**Status:** Approved via brainstorming (visual companion), 2026-08-13.

## Context

`apps/web` (Expo Router — renders web, iOS, Android from one codebase) currently ports the original 321guess website's design 1:1 via NativeWind: muted cream/forest-green tokens (`paper`, `ink`, `accent`, light+dark theme), thin-bordered flat cards. Seeing this rendered on a physical iOS development build, it read as flat and web-like rather than "app-native" — reasonable for a content site, undersized for a game.

Goal: give mobile (iOS/Android) a livelier, more "app-native" game identity — while **web's look stays exactly as it is today**. Same game logic, same data, same weekly-update workflow (the entire reason this became a React Native/Expo monorepo); only the presentational layer diverges per platform, and only where it needs to.

## Non-goals

- No change to `www.321guess.com`'s visual design.
- No change to game rules, data model beyond one additive field (club color), or API contracts.
- No full-screen native-vs-web component forking (`.web.tsx` duplicate files). Divergence happens through platform-conditional style tokens inside shared components, so a future weekly content/rule update still touches one file, not two.

## Visual direction (approved via mockup review)

- **Base palette — "arena":** a fixed dark, saha-yeşili (forest green) game chrome, independent of the device's light/dark setting. This is a deliberate departure from web's theme-following behavior: mobile always opens in the arena look, the way most mobile games maintain one consistent in-game palette. Web's existing light/dark toggle is untouched.
- **Action buttons:** solid-color, thick-bottom-border "pressable" style (flat color face + a darker shade of the same color as a ~4-5px bottom edge, rounded corners) — reads as tactile/tappable at a glance. Used for every real interactive action: submit guess, next question, play again, Setup's selected-mode card, language switcher, hint button.
- **Club logo tiles:** explicitly *not* styled as buttons (they aren't tappable — the real interaction is the player-name search field below them). Approved treatment: a circular medallion — the club's logo on a neutral near-white circular badge, ringed with a thin border in that club's own extracted color, soft ambient shadow (no colored 3D bottom-border). An unselected slot (Manual mode's second team picker) shows the same circle as a dashed-outline "+" placeholder in the arena accent color.
- **Setup mode-selection cards:** the selected mode gets the gradiented accent-color treatment (amber gradient + bottom-shadow, matching the button language); unselected modes are neutral dark-green-bordered cards with an icon + two-line label.

## Team colors

Neither `clubs.json` nor the `Club` type carries any color data today. Approach: extract each club's dominant/representative color from its existing `logoUrl` at data-fetch time, store it as a new field.

- **New script** `apps/api/scripts/extract-club-colors.ts`, run after `refetch-logos` in the existing fetch pipeline (fetch-wikidata → enrich-popularity → refetch-logos → extract-club-colors). Downloads each club's logo image, computes a representative color (dominant/average, excluding transparent pixels), and writes it back into `clubs.json`.
- **Contrast safety:** clamp extracted colors to a minimum saturation/lightness band before storing, so a black-and-white or very pale crest doesn't produce an invisible or muddy-gray ring. Exact clamp thresholds are an implementation detail for the plan, not a design decision.
- **Type change:** `Club` (in `packages/core/src/types.ts`) gains `color: string` (hex). `LogoTile` (and any Manual-mode selected-team display) reads `club.color` for its ring; falls back to a fixed neutral arena accent if a club is somehow missing the field (should not happen post-migration, but keeps the component defensive).
- **Scope:** only club logo tiles get per-club color. Country flags (Country×Club mode) keep the neutral arena palette — a flag already carries national color, recoloring its frame would be redundant.
- This only *adds* a field to existing club records; no existing club/player data is modified. Consistent with the standing rule never to touch player-identity data casually — this pipeline only touches presentation metadata for clubs.

## Interaction, haptics, sound

All three approved as in-scope for this pass:

- **Touch/press animation:** spring scale-down on button press (via `react-native-reanimated`, already a dependency), spring back on release.
- **Micro-celebration on a correct guess:** a brief scale+glow pulse on the logo tiles or a short particle/confetti burst — exact treatment decided during implementation, built with Reanimated rather than a new animation dependency.
- **Haptics:** `expo-haptics` (new dependency) — light impact on any button tap, success notification haptic on a correct guess, error/warning haptic on a wrong guess. iOS/Android only; no-op on web.
- **Sound:** short (<1s) generated effects for tap / correct / wrong, played via `expo-audio` (new dependency, the current recommended Expo audio API). A mute toggle is added to the app's existing settings surface (`GameSettingsProvider`) since shipping sound without an off switch is not acceptable. Sound effects are generated (not licensed/sourced third-party assets) and bundled as local static files under `apps/web/assets/sounds/`.

## Architecture: platform-conditional styling

New NativeWind color tokens for the arena palette, added alongside (not replacing) the existing `paper`/`ink`/`accent` family in `tailwind.config.js` — e.g. `arena-bg`, `arena-bg-soft`, `arena-accent` (amber), `arena-accent-strong` (its shadow/border shade), `arena-accent-2` (turquoise/green secondary), `arena-text`, `arena-text-soft`, `arena-card` (near-white medallion background).

Shared components branch on `Platform.OS` to pick which token family applies — e.g. a button component resolves its className via `Platform.OS === 'web' ? 'bg-accent ...' : 'bg-arena-accent border-b-4 border-arena-accent-strong ...'`. This keeps one component, one file, one set of props/behavior; only the Tailwind classes selected at render time differ. The exact shared-helper shape (a small `usePlatformClass`-style utility vs. inline `Platform.select` at each call site) is an implementation decision for the plan.

## Screens affected

All four: Setup (mode/difficulty cards), Manual (club picker + medallions), Play/Countdown (question header, logo medallions, guess input, submit button), Online/Daily Challenge (same components as Play, plus streak/progress indicators). Web equivalents of all four are unchanged.

## Testing / verification

- `tsc --noEmit` and `expo export -p web` must stay clean and unchanged in output (web path must not pick up any arena token by accident).
- Existing 27-test suite (packages/core, apps/api) must keep passing; the club-color script gets its own unit test (e.g., a known logo's extracted color falls within an expected hue range, and the contrast clamp is exercised on a near-white/near-black input).
- Manual on-device verification on the physical iOS development build already set up this session (Play, Online, Manual, Setup) — haptics and sound specifically require a real device, not the simulator or Playwright.
