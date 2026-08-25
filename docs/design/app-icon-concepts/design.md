# 321guess — App Icon Design

## Problem

The app's icon/splash branding was never customized — it's still Expo's default template end to end:

- `apps/web/assets/images/icon.png` — Expo's default blue chevron symbol
- `apps/web/assets/expo.icon/` — Expo's default Icon Composer bundle (`icon.json` fill is Apple system blue `extended-srgb:0.00000,0.47843,1.00000,1.00000`, shape is `expo-symbol 2.svg`)
- `apps/web/assets/images/android-icon-foreground.png` / `-background.png` / `-monochrome.png` — same default blue chevron
- `apps/web/assets/images/splash-icon.png` + `expo-splash-screen` plugin config (`app.json`) — background color `#208AEF`, Expo's default blue
- `expo-notifications` plugin icon color — also `#208AEF`
- `apps/web/src/components/animated-icon.tsx` — native splash overlay genuinely renders `expo-logo.png` (Expo's own template logo) as the launch animation
- `apps/web/public/favicon*.png`, `og-image.png` etc. — currently generated FROM the wrong `icon.png`, so they inherit the same problem

This blocks App Store / Play Store submission — the already-completed EAS production builds from earlier this session used the Expo default icon and are obsolete until this is fixed.

## Brand palette (established, "arena" design system)

| Token | Hex | Use |
|---|---|---|
| `arena-bg` | `#0F2A1E` | base background |
| `arena-bg-soft` | `#153A28` | card/surface |
| `arena-accent` (amber) | `#FFC738` | primary accent |
| `arena-accent-strong` | `#C99418` | accent pressed/border |
| `arena-accent-2` (mint) | `#2ECC8F` | secondary accent |
| `arena-text` (cream) | `#F0FBF5` | primary text/light shapes |
| `arena-text-soft` | `#8FE8C4` | secondary text |

## Constraint: category-agnostic

321guess is currently a football-player-guessing game, but there are concrete plans to expand into other categories later (NBA player guessing, TV/movie actor guessing). This means:

- Football-specific imagery (a ball, boots/cleats) commits the brand to football and would need to be redesigned when a new category ships.
- Imagery tied to the app's actual mechanic — the name ("321"), the countdown, or the "versus/challenge" idea of the guessing format — stays correct regardless of category.

Every concept below is tagged **category-agnostic** or **football-specific** on that basis.

## Concepts

All rendered at 1024×1024 on `arena-bg` (#0F2A1E). Files are in this folder (`concept-a.png` … `concept-g.png`).

### A — Plain "321"
![Concept A](concept-a.png)
Bold amber "321" numerals, single line, huge and simple. **Category-agnostic** — literal app-name mark, no domain imagery at all.

### B — "3·2·1" with dots
![Concept B](concept-b.png)
Same numerals with cream separator dots, matching the site's wordmark style (`3·2·1guess`). **Category-agnostic.**

### C — Countdown stack + ring
![Concept C](concept-c.png)
3/2/1 shrinking downward inside a mint ring, evoking the in-app countdown animation directly. **Category-agnostic.**

### D — Soccer ball + "321"
![Concept D](concept-d.png)
Simplified soccer ball with amber "321" beneath. **Football-specific** — would need replacing if/when NBA or movie categories ship.

### E — "VS", bold and tilted
![Concept E](concept-e.png)
Large tilted amber "VS" wordmark, sports-poster style. **Category-agnostic** — "versus" describes the guessing format itself, not a sport.

### F — Crossed boots + "VS"
![Concept F](concept-f.png)
Two crossed football boots/cleats (cream + amber) with mint "VS" beneath. **Football-specific.**

### G — Crossed swords
![Concept G](concept-g.png)
Two crossed swords (cream + amber), literal "challenge/duel" imagery, no text. **Category-agnostic** — reads as "head-to-head" without naming a sport.

## Recommendation

Given the multi-category roadmap, prefer a **category-agnostic** concept: **E ("VS")** or **G (crossed swords)** carry the "challenge/versus" idea without naming a sport; **A/B ("321")** tie directly to the app name instead. D and F are strong *football* icons but are the wrong bet if the NBA/movie expansion is real.

## Decision

**Chosen concept:** "321 Ring" — a countdown ring (mint + amber arcs, matching segments) with "321" as a single horizontal wordmark inside it, glossy/3D-shaded style. Approved by the user 2026-08-25. Final master: `chosen-final.png` in this folder (also `apps/web/assets/images/icon.png`).

This superseded concepts A–G above — none of those were carried forward. The user provided the source art directly (generated externally, not by Claude) as a transparent PNG; earlier in the same session a stacked-vertical "3 / 2 / 1" arrangement of the same ring concept was tried first and rejected for legibility (see below), before the user supplied the horizontal version that was approved.

**Why horizontal over stacked:** the numerals need to read as "321" at a 32px favicon size. A vertical stack (3 above 2 above 1) loses individual digit legibility once the whole mark is shrunk that small — three digits' worth of height gets compressed into 32px, blurring together. Laid out horizontally, "321" reads clearly even at 32px because it uses the canvas's full width instead of dividing height three ways.

**Implementation notes for next time a master needs regenerating:**
- Source was landscape (1536×1024), transparent background, hard-edged alpha (not a soft gradient — confirmed by sampling the alpha channel directly, despite the source *looking* like it had a soft radial glow behind it in preview; that "glow" was baked into the opaque glyph's own coloring, not a transparency gradient, so a direct composite onto `arena-bg` came out clean with no halo artifact).
- Generation script (`sharp`-based, composites the source onto `arena-bg` for the opaque master, and separately onto nothing for the transparent Android foreground layer) produced: `icon.png` (1024×1024 opaque), `android-icon-foreground.png` (transparent, content confined to ~64% safe zone), `android-icon-background.png` (flat `arena-bg` fill), `android-icon-monochrome.png` (white silhouette via `sharp().tint()`), `splash-icon.png`, the full web favicon set, and `og-image.png` (mark + "guess" wordmark + tagline, composed via SVG).
- `apps/web/assets/expo.icon/` (the iOS 18+ Icon Composer bundle) was **not** rebuilt — that format needs Xcode's Icon Composer app, which isn't scriptable. `app.json`'s `ios.icon` was pointed at the plain `icon.png` instead, dropping that bundle entirely rather than shipping it stale/mismatched.

## Implementation checklist (once a concept is chosen)

Regenerate/replace, from the final 1024×1024 master art:

1. `apps/web/assets/images/icon.png` — main icon source (referenced by `app.json` → `expo.icon`)
2. `apps/web/assets/expo.icon/` — rebuild the Icon Composer bundle (`icon.json` fill + `Assets/`) to match, for iOS 18+ (currently Apple-blue default)
3. `apps/web/assets/images/android-icon-foreground.png` / `-background.png` / `-monochrome.png` — Android adaptive icon set (`app.json` → `android.adaptiveIcon`, currently background `#E6F4FE`)
4. `apps/web/assets/images/splash-icon.png` + `app.json` → `expo-splash-screen.backgroundColor` (currently `#208AEF`, Expo default blue) — switch to `arena-bg` or another brand color
5. `app.json` → `expo-notifications.color` (currently `#208AEF`) — switch to brand accent
6. `apps/web/src/components/animated-icon.tsx` — native splash overlay currently renders `expo-logo.png`; swap for real branding
7. `apps/web/public/favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, `favicon.ico`, `og-image.png` — regenerate from the new master (script pattern: `sharp`-based resize, see prior `gen-assets.js`)
8. `apps/web/assets/images/favicon.png` — separate web favicon referenced directly by `app.json` → `web.favicon`
9. Trigger fresh EAS production builds for iOS and Android — the icon is baked into the native binary, so any earlier "finished" build is obsolete until this ships
