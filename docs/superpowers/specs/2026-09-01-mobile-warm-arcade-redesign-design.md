# Mobile "Warm Arcade" Redesign

**Status:** Approved via brainstorming (visual companion), 2026-09-01.

## Context

The mobile app (iOS/Android, via `apps/web`'s Expo Router) already has a mobile-only
"arena" design system (see `docs/superpowers/specs/2026-08-13-mobile-lively-design-design.md`):
a fixed dark forest-green palette (`arena-bg` `#0F2A1E`), gold/turquoise pressable
buttons, circular logo medallions, haptics, sound, and platform-conditional
NativeWind tokens. After real device testing (2026-08-28, the challenge-mode
branch), the user's reaction was that the whole app still "looks cold and
mechanical" — flat, undersized, closer to a ported website than a game.

Two concrete, unrelated-but-compounding causes were confirmed during
investigation:

1. The arena spec's approved club-color-ringed medallions were never actually
   built — `extract-club-colors.ts` was never run, `clubs.json` has no `color`
   field, so every medallion still renders the same flat neutral ring
   regardless of matchup.
2. Independent of that, the user wants a more "app-native" layout on top of
   the existing palette: bigger primary actions, a full-bleed hero-style home
   screen instead of a stacked card list, more generous spacing throughout.

This spec keeps everything about the arena system that already works
(haptics via `lib/haptics.ts`, sound via `lib/sound.ts`/`GameSettingsProvider`,
`Platform.OS`-conditional NativeWind tokens, `ArenaPressable`'s pressable
button mechanics) and changes: the background treatment, five screens'
layouts, and finally wires up club colors.

## Non-goals

- **Web is untouched.** `www.321guess.com` keeps its existing `paper`/`ink`
  light+dark theme exactly as today — same rule the original arena spec set.
- No change to game rules, scoring, or any API contract.
- No change to Challenge Mode's or account linking's *functional* behavior
  (data flow, validation, server calls) — this is a presentational pass over
  screens that already work, from the branch already in flight
  (`worktree-challenge-mode`).
- Copy/wording on the redesigned screens is the user's own to finalize later;
  this spec's mockup text is illustrative, not locked.
- No sound/haptics/motion changes beyond what the arena spec already
  approved — this pass is palette + layout + club color, not a new motion
  system.

## Visual direction (approved via mockup review)

**Background scope:** the gradient background (below) applies to every
native screen currently using flat `arena-bg` as its root background —
`SetupScreen`, `ChallengeScreen`, `SettingsScreen`, `ManualScreen`,
`OnlineScreen`, `PlayScreen`, `RoundView`, `RoundPlayView`,
`GameSettingsPicker`, `ArenaChip` — not just the five screens with their
own layout mockups below. This is a background-color-only change for the
screens outside this spec's five; their internal layout is untouched.
Consistency (one continuous "arena" backdrop app-wide) matters more than
tightly scoping the swap to only the reviewed mockups.

**Base palette — "warm arcade":** replaces `arena-bg`'s flat `#0F2A1E` with a
dark radial gradient — `#3A2E5C` at the top fading to `#1A1330` — kept across
every screen covered by this spec. The existing gold/turquoise accent family
(`arena-accent` `#FFC738` / `arena-accent-strong` `#C99418`,
`arena-accent-2` `#2ECC8F` / `arena-accent-2-strong` `#1F9C6C`) is **kept
as-is** — approved in review specifically *for* its warmth-by-contrast against
the new cooler-toned background, not replaced with a literally "warm" hue.
`arena-text`/`arena-text-soft` also carry over unchanged. New token:
`arena-bg-soft` becomes the translucent-white overlay used for card/row
backgrounds against the gradient (`rgba(255,255,255,0.06–0.16)` depending on
prominence — exact values finalized per-component during implementation,
matching the mockups) rather than the old solid `#153A28`.

**Five screens, each reviewed as a mockup and approved:**

1. **Setup / home (native branch)** — "Full-Bleed Hero" layout. A centered
   hero block near the top (icon/emblem + app name + short tagline) replaces
   today's stacked-cards-from-the-top layout. Below it, ONE dominant primary
   CTA — the biggest tap target on the screen — for Daily Challenge, styled
   with the existing gold pressable treatment at a larger scale. Below that,
   the other two entry points ("Arkadaşına Meydan Oku", "Tek Cihazdan Oyna")
   render as a row of two smaller side-by-side chips, not full-width cards —
   visually secondary to the hero CTA, still each a full tap target.

2. **Gameplay / question screen (Play + Online, shared component)** —
   "Büyütülmüş klasik" (enlarged classic): keeps today's structure (timer
   pill, two medallions with a VS divider, hint text, per-question found-dots,
   text input, submit button) but every element scales up — medallions grow
   to ~100px, the submit button becomes the same large gold pressable style
   as the home hero CTA, and spacing between elements increases so the
   screen reads as fewer, bigger things rather than a dense stack.

3. **Challenge hub (`ChallengeScreen`'s hub view)** — primary CTA "+ Yeni
   Meydan Okuma" in the large gold style; secondary "🎲 Rastgele Rakip"
   renders as an *outlined* turquoise chip (not gold) — the outline
   distinguishes "secondary but still an action" from the hero-style primary
   treatment used elsewhere. Section labels ("Gelen Davetler", "Bekleyenler",
   "Rekabet Geçmişi") become small uppercase labels with letter-spacing.
   Empty states are soft muted boxes (translucent white, no border). Rivalry
   history rows show the two players' club-color-ringed medallions
   overlapping slightly, avatar-stack style.

4. **Settings screen** — each setting (language, sound, haptics) becomes one
   full-width translucent row: icon + label on the left, a chevron (language)
   or toggle (sound/haptics) on the right. The optional account-linking
   section gets a visually distinct treatment — a gold-tinted card (subtle
   gradient border/fill) — so it reads as a special, separate feature rather
   than one more settings row, matching its actual product role (optional,
   not required — see the account-linking plan's Global Constraints, which
   this redesign does not change).

5. **Send / opponent-search screen** — the username search input matches the
   other screens' input styling; a found match renders as a row with a
   circular avatar-initial badge (first letter of the username, gold
   background); the send action is a large gold button pinned as a sticky
   footer (matching the arena spec's existing sticky-terminal-action rule).

**Back navigation, all three non-home screens above:** each mockup includes a
visible "← back" affordance at the top. This isn't a new decision so much as
making explicit something the arena spec assumed but at least one screen
(Challenge Mode's send screen) shipped without — see "Known gap to close"
below.

## Club colors (finally implemented)

This closes a gap from the *original* arena spec (2026-08-13), which
specified this exact feature but was never executed:

- Run `apps/api/scripts/extract-club-colors.ts` (already written, never
  executed) against the live `clubs.json`, per that script's existing
  contrast-clamping logic.
- `LogoTile` (and any other medallion renderer) reads `club.color` for its
  ring, exactly as the original spec described — no new code path, just
  actually populating the data the existing code already reads.
- Scope unchanged from the original spec: club logo tiles only; country
  flags keep the neutral arena ring.

## Known gap to close alongside this work

Plan A's final review parked "no back/skip button on the send screen" as a
non-blocking Minor issue; physical-device testing on 2026-08-28 confirmed it
as a real friction point (had to use iOS's edge-swipe gesture to exit). Since
this redesign touches that exact screen's layout anyway, add the same back
affordance the other screens get — not a separate fix, just not skipping it
this time.

## Architecture: no new mechanism needed

This is a token-and-layout revision on top of the arena system's existing
`Platform.OS`-conditional-styling architecture (2026-08-13 spec, "Architecture"
section) — no new abstraction required. `ArenaPressable`, `lib/haptics.ts`,
`lib/sound.ts` (if that's the actual filename — verify against current
codebase during planning), and `GameSettingsProvider` are all reused as-is.
The five screens' JSX/layout changes; the underlying interaction mechanics
(press animation, haptic-on-tap, sound-on-tap) do not.

## Testing / verification

- `tsc --noEmit` and `expo export -p web` must stay clean and byte-identical
  in web output — this pass touches only `Platform.OS !== 'web'` branches
  and mobile-only screens.
- Existing test suite (apps/api, packages/core) must keep passing;
  `extract-club-colors.ts` already has a unit test per the original arena
  spec — confirm it still passes once actually run against real data (not
  just in isolation).
- Manual on-device verification on a physical iOS device (established this
  session: an iPhone 13, via an EAS internal-distribution build) for all
  five redesigned screens, plus a regression pass confirming Daily
  Challenge / Manual / Play (screens NOT in this spec's scope) render
  unchanged.
