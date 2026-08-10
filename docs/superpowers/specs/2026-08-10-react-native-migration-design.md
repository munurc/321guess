# 321guess: React Native migration (single codebase for web + iOS + Android)

## Context

321guess is currently a Next.js 15 (App Router) website with a Supabase-backed
"Daily Challenge" online mode. An earlier design ([supabase/push_tokens.sql](../../../supabase/push_tokens.sql)
and friends) added a Capacitor "remote URL" wrapper (`mobile/`) so the live
website could be shipped as a thin native iOS/Android shell, with
`components/PushRegistration.tsx` bridging to `@capacitor/push-notifications`
+ FCM for a daily "today's challenge is ready" push.

That work is **superseded by this design**. The user decided they want a
single React Native (Expo) codebase that produces the web site, the iOS app,
and the Android app from one set of screens — so that weekly updates (game
data, rules, new modes, and visual tweaks) reach all three platforms without
being written twice. The Capacitor wrapper's core limitation was exactly
this: it reused the *website* as-is, but any future native-feeling
redesign of the app would have meant a second, separately maintained UI
forever.

None of today's app/API-side work is wasted — the push notification
*backend* (Supabase table, register/cron routes, FCM sender) carries over
almost unchanged into the new architecture; only the *client* delivery
mechanism changes (from a Capacitor WebView bridge to Expo's native push
APIs), and the Capacitor-specific files (`mobile/`,
`components/PushRegistration.tsx`) are deleted.

**Explicit trade-off accepted**: the user confirmed SEO/organic search is
not a current priority, so this migration does not attempt to preserve the
current site's SEO maturity (fast Next.js SSR, `sitemap.ts`, `robots.ts`,
per-locale `generateMetadata`, OpenGraph image generation). The
SEO-preserving alternative (keep Next.js for web, share UI via
react-native-web in a Solito-style monorepo) was considered and rejected —
see "Alternatives considered" below.

## Goals

- One set of screen components drives web, iOS, and Android.
- Weekly changes (club/league/player data, game rules, new modes, visual
  tweaks) are written once and are live on all three platforms without
  hand-porting.
- Daily Challenge push notifications work natively on iOS and Android.
- The existing Supabase schema, online-mode game rules, and player identity
  model (client-held `player_token` UUID, no real auth) are preserved as-is.

## Non-goals

- Preserving current SEO ranking/tooling maturity (explicitly deprioritized).
- Preserving pixel-identical web UI during the migration — screens are
  redesigned for a native-first feel as they're ported.
- Automated UI test coverage for the new screens (manual verification in
  Expo Go / simulators, matching how the current web UI is verified today).

## Architecture

Monorepo, npm workspaces, three top-level packages:

```
321guess/
├── apps/
│   ├── web/     Expo Router project. Single codebase → web (react-native-web
│   │            export) + iOS + Android via EAS Build.
│   └── api/     Slimmed-down Next.js: ONLY app/api/*, cron config, Supabase
│                access. No page routes — Expo Router also owns an `app/`
│                directory convention, so backend and frontend cannot share
│                one Next.js project root.
└── packages/
    └── core/    Framework-agnostic TypeScript, shared by apps/web (directly
                 imported) and apps/api (same game-generation logic used
                 server-side). Contains: lib/game.ts, lib/daily-round.ts
                 (minus the Next.js-specific route glue), lib/types.ts,
                 lib/profanity.ts, dataset JSON, i18n message catalogs
                 (locales/en.json, locales/tr.json content, reloaded via a
                 lightweight i18n library instead of next-intl).
```

**Why split `apps/api` out instead of using Expo Router's own API routes**:
the backend (Supabase access, cron-triggered push broadcast, Vercel Cron
config) already exists, tested, and isn't the part of the system that was
duplicated across platforms — any client (web fetch or native fetch) already
calls the same REST endpoints today. Re-platforming it onto Expo Router's
newer, less-proven server-route support would be pure risk for no benefit.
Keeping it as a slim Next.js/Vercel deployment lets nearly all of today's
work (`lib/push-db.ts`, `lib/fcm.ts`, `app/api/push/register/route.ts`,
`app/api/cron/notify-daily-challenge/route.ts`, `supabase/push_tokens.sql`,
`vercel.json`) move over unchanged.

## Migration scope

**Rewritten (RN primitives + NativeWind)**: `SetupScreen`, `PlayScreen`,
`RoundView`, `ManualScreen`, `OnlineScreen` (largest — timer, guess input,
leaderboard, share card), `LogoTile`, `ThemeToggle`, `LanguageSwitcher`.
NativeWind is used so most existing Tailwind class names translate directly,
easing (not eliminating) the port.

**Carried over near-unchanged into `packages/core`**: `lib/game.ts`,
`lib/daily-round.ts`'s pure question-generation logic, `lib/types.ts`,
`lib/profanity.ts`, `public/data/*.json` datasets. These have no DOM/React
dependency today, so they move as plain TypeScript.

**Deleted**: `mobile/` (Capacitor project), `components/PushRegistration.tsx`
(Capacitor↔web bridge, no longer applicable).

**Effort expectation**: not a single session. Realistically 2-4 weeks,
screen by screen, starting with the simplest (`ManualScreen`) before the
largest (`OnlineScreen`).

## Push notifications

Client: `expo-notifications` replaces `@capacitor/push-notifications` +
`@capacitor-community/fcm`. Permission request + `getExpoPushTokenAsync()` →
POST to `/api/push/register` (same endpoint, same request shape as today).

Server: `apps/api` keeps today's `push_tokens` table, `/api/push/register`,
and the `notify-daily-challenge` cron. Whether the cron sends via Expo's own
push relay (simpler, Expo manages the APNs/FCM handshake) or continues using
`lib/fcm.ts`'s direct `firebase-admin` sender is an implementation-phase
decision, not an architectural one — both consume the same `push_tokens`
rows and don't change the schema or the register endpoint's contract.

## Deployment

- `apps/web` → `www.321guess.com` (Expo web export).
- `apps/api` → `api.321guess.com` (separate Vercel project, same Supabase
  project as today).
- `apps/web` calls `apps/api` over HTTPS at the `api.` subdomain — no
  same-origin assumption, no Vercel-rewrite path routing needed.

## Testing & error handling

- `packages/core` keeps the existing Vitest suite (`game.test.ts`,
  `daily-round.test.ts`, `profanity.test.ts`) unchanged — these are
  framework-agnostic already.
- `apps/web` screens are verified manually (Expo Go / simulators), matching
  today's manual browser verification — no new automated UI test investment.
- `apps/api` routes are re-verified with the same manual curl checks used
  when they were first built.
- Native screens handle offline/API-failure explicitly (reusing today's
  `online.roundError` message pattern) instead of the Capacitor wrapper's
  unrecoverable white-screen-on-offline failure mode.

## Alternatives considered

1. **Solito-style monorepo** (keep Next.js for web, share UI via
   react-native-web with an Expo native app) — preserves SEO maturity but
   requires two bundlers (Next.js's + Expo's Metro) to agree on every shared
   component, meaningfully increases setup time and ongoing dependency-
   upgrade friction. Rejected because the user confirmed SEO isn't currently
   a priority, so this cost isn't worth paying.
2. **Keep the Capacitor wrapper** — cheapest to maintain (already built,
   already tested) but permanently couples the app's UI to the website's
   UI, which conflicts with the user's stated goal of a from-scratch native
   redesign plus one shared codebase going forward.

## Open questions for the implementation plan

- Expo push relay vs. direct FCM (`lib/fcm.ts`) for the cron sender —
  decide during implementation, doesn't affect this design's contracts.
- i18n library choice for `packages/core`'s message catalogs (e.g.
  `i18next`/`react-i18next` vs. a minimal custom loader) — implementation
  detail, not architectural.
- Exact NativeWind/Metro/Babel config — implementation detail.
