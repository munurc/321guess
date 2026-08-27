# Challenge Mode Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player optionally link their existing lightweight identity (username + `player_token`) to a Google, Apple, or email account via Supabase Auth, so switching devices recovers the same identity/history/rivalries instead of generating a fresh one.

**Architecture:** Supabase Auth (already the project's backend) handles all three sign-in methods natively — no custom OAuth server. The client obtains a Supabase session (an access-token JWT) via one of three sign-in flows, then calls two new `apps/api` endpoints that verify that JWT server-side (never trusting a client-supplied user id directly) before reading/writing `online_players.auth_user_id`. Recovery is folded into the existing `loadIdentity()` function so every screen that already calls it (unmodified) benefits automatically.

**Tech Stack:** `@supabase/supabase-js` (client-side, new to apps/web), `expo-apple-authentication` (new), `expo-web-browser` + `expo-linking` (already present), Next.js API routes, vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-challenge-mode-design.md`'s "Account Linking" section. Sibling plan: `docs/superpowers/plans/2026-08-26-challenge-mode-core.md` (already added the `online_players.auth_user_id` column in its Task 1 — this plan does not touch schema).

## Global Constraints

- `apps/api` must **never** trust a client-supplied `authUserId`/user id directly. Every account-linking endpoint verifies a Supabase access token server-side via `getSupabaseServerClient().auth.getUser(accessToken)` and only ever uses the `id` that call returns.
- This plan does not modify `OnlineScreen.tsx`, `ChallengeScreen.tsx`, or any file from the sibling Core plan — its only integration points are `apps/web/src/lib/online-storage.ts` (`loadIdentity()` gains an internal recovery fallback; its signature and already-has-local-identity behavior are unchanged) and `apps/web/src/components/SettingsScreen.tsx` (new "Hesabını Bağla" section) and `apps/web/src/app/_layout.tsx` (one new native-only effect component, mirroring `PushRegistration`'s existing pattern).
- Every new API route follows the same shape as the Core plan's routes: `OPTIONS` returning 204, `{ error: "invalid_body" }` (400) / `{ error: "server_error", message }` (500) on the existing error paths.
- Linking is opt-in and additive — a player who never links anything keeps working exactly as today. Nothing in this plan changes behavior for an unlinked player.
- No native offline behavior changes. Every new UI element is native-only (`Platform.OS !== "web"` or a native-only screen, matching `SettingsScreen.tsx`'s existing scope).

---

### Task 1: Manual prerequisite — Supabase Auth provider configuration

**Files:** none (account-level setup, not code)

**Interfaces:** none — this task produces the OAuth client credentials Task 9/10's code assumes exist in the Supabase project's Auth settings. No later task can be tested end-to-end (real sign-in) without this, though Tasks 2–8 (client setup, backend routes, recovery logic) can be built and unit-tested without it.

- [ ] **Step 1: Configure Google in the Supabase dashboard**

In the Supabase project's dashboard: **Authentication → Providers → Google**. This requires an OAuth 2.0 Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application type). Set its **Authorized redirect URI** to the callback URL Supabase's dashboard displays on that same Google provider page (format: `https://<project-ref>.supabase.co/auth/v1/callback`). Paste the resulting Client ID and Client Secret into Supabase's Google provider fields and enable it.

- [ ] **Step 2: Configure Apple in the Supabase dashboard**

In [Apple Developer](https://developer.apple.com/account) (the paid account already active this session): create a **Services ID** (distinct from the app's existing Bundle ID `com.threetwoone.guess`) under Certificates, Identifiers & Profiles → Identifiers, with "Sign In with Apple" enabled, configured with the same callback URL Supabase's Apple provider page displays. Also enable the **Sign In with Apple** capability on the app's own Bundle ID (`com.threetwoone.guess`) — this is required for `expo-apple-authentication`'s native button to work regardless of the web Services ID. In Supabase's dashboard: **Authentication → Providers → Apple**, fill in the Services ID, Team ID, Key ID, and the private key (`.p8` file) generated from Apple Developer → Keys.

- [ ] **Step 3: Enable Email OTP/magic-link in the Supabase dashboard**

**Authentication → Providers → Email** — confirm "Enable Email provider" is on (it is by default for new Supabase projects) and that "Confirm email" / magic-link sending is enabled. No external credentials needed for this one — Supabase sends the email itself.

- [ ] **Step 4: Add the redirect URL Supabase needs to allow**

**Authentication → URL Configuration → Redirect URLs** — add `guess321://auth-callback` (the app's existing `app.json` scheme, `guess321`, plus the path this plan's deep-link handler listens on — see Task 11). Without this, Supabase refuses to redirect back into the app after any of the three sign-in flows complete.

- [ ] **Step 5: Record the project's public API values**

From **Project Settings → API**: copy the Project URL and the `anon` `public` key (not the `service_role` key already used server-side — this is the client-safe one). These feed `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` in Task 2.

No commit for this task — it's account configuration, not a code change.

---

### Task 2: Add client dependencies and env vars

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/.env.local` (not committed — local dev values only)

**Interfaces:**
- Produces: `@supabase/supabase-js`, `expo-apple-authentication`, `react-native-url-polyfill` as installed dependencies; `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` as documented/available env vars, consumed by Task 3.

- [ ] **Step 1: Install the new dependencies**

```bash
cd apps/web
npx expo install @supabase/supabase-js expo-apple-authentication react-native-url-polyfill
```

`expo install` (not plain `npm install`) picks SDK-54-compatible versions, matching how every other native dependency in this project was added.

- [ ] **Step 2: Document the new env vars**

Add to `apps/web/.env.example`:

```
# Supabase Auth (optional account linking) — client-safe values only, from
# Project Settings → API. Never put the service_role key here; that one
# stays server-side in apps/api's .env.local.
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Fill in local dev values**

Add the same two keys to `apps/web/.env.local` (gitignored) with the real values recorded in Task 1 Step 5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/.env.example
git commit -m "Add Supabase Auth client dependencies for account linking"
```

(`.env.local` is gitignored — nothing to add there.)

---

### Task 3: Supabase client for React Native

**Files:**
- Create: `apps/web/src/lib/supabase-client.ts`
- Modify: `apps/web/src/app/_layout.tsx` (one import, for the URL polyfill — see Step 2)

**Interfaces:**
- Produces: `supabase: SupabaseClient` (a configured singleton), consumed by every client-side auth flow (Tasks 8–11).

- [ ] **Step 1: Write the client**

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Account linking is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example). Sign-in buttons will fail until this is set.",
  );
}

/** Client-side Supabase client for optional account linking — separate
 * from apps/api's server-only service-role client (lib/supabase.ts
 * there), which must never be imported into this app. Uses the public
 * `anon` key only; every privileged write (setting online_players.
 * auth_user_id) happens server-side in apps/api after verifying this
 * client's session token. AsyncStorage-backed session persistence and
 * detectSessionInUrl:false are the standard Supabase+Expo pattern — RN
 * has no browser URL bar for Supabase to inspect. */
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 2: Add the URL polyfill at the app's entry point**

`@supabase/supabase-js` needs `URL` support React Native doesn't provide natively. Add this as the **first line** of `apps/web/src/app/_layout.tsx` (before any other import):

```tsx
import "react-native-url-polyfill/auto";
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors (a missing env var only warns at runtime, not a type error)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/supabase-client.ts apps/web/src/app/_layout.tsx
git commit -m "Add Supabase client for account linking"
```

---

### Task 4: Server-side token verification and account DB access

**Files:**
- Create: `apps/api/lib/account-db.ts`
- Test: `apps/api/lib/account-db.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `./supabase`.
- Produces: `type VerifiedUser = { id: string }`, `verifyAccessToken(accessToken: string): Promise<VerifiedUser | null>` (wraps `supabase.auth.getUser`, returns `null` on any failure rather than throwing — an expired/forged token is an expected case, not a server error), `linkAccount(playerToken: string, authUserId: string): Promise<void>`, `getPlayerByAuthUserId(authUserId: string): Promise<{ playerToken: string; username: string } | null>`, and a pure helper `isValidVerifiedUser(value: unknown): value is VerifiedUser` used by `verifyAccessToken` and tested directly (the actual `supabase.auth.getUser` network call isn't unit-testable without a live project, same as this codebase's existing untested network-calling functions like `lib/fcm.ts`'s `sendPushToTokens` — but the response-shape validation around it is pure and worth testing).

- [ ] **Step 1: Write the failing test for the pure validation helper**

```typescript
import { describe, expect, it } from "vitest";
import { isValidVerifiedUser } from "./account-db";

describe("isValidVerifiedUser", () => {
  it("accepts an object with a non-empty string id", () => {
    expect(isValidVerifiedUser({ id: "abc-123" })).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidVerifiedUser(null)).toBe(false);
  });

  it("rejects an object with a missing id", () => {
    expect(isValidVerifiedUser({})).toBe(false);
  });

  it("rejects an object with a non-string id", () => {
    expect(isValidVerifiedUser({ id: 123 })).toBe(false);
  });

  it("rejects an object with an empty-string id", () => {
    expect(isValidVerifiedUser({ id: "" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx vitest run lib/account-db.test.ts`
Expected: FAIL with "Cannot find module './account-db'"

- [ ] **Step 3: Write the implementation**

```typescript
import { getSupabaseServerClient } from "./supabase";

export type VerifiedUser = { id: string };

export function isValidVerifiedUser(value: unknown): value is VerifiedUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    (value as { id: string }).id.length > 0
  );
}

/** Verifies a Supabase Auth access token server-side and returns the
 * authenticated user's id — this is the ONLY trustworthy source of a
 * user's identity anywhere in this feature. Never accept a client-
 * supplied user id directly; always run it through this first. Returns
 * null (not a throw) for an invalid/expired/forged token, since that's
 * an expected outcome the caller must branch on, not a server fault. */
export async function verifyAccessToken(accessToken: string): Promise<VerifiedUser | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !isValidVerifiedUser(data?.user)) return null;
  return { id: data.user.id };
}

export async function linkAccount(playerToken: string, authUserId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("online_players")
    .update({ auth_user_id: authUserId })
    .eq("player_token", playerToken);
  if (error) throw error;
}

export async function getPlayerByAuthUserId(authUserId: string): Promise<{ playerToken: string; username: string } | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .select("player_token, username")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data ? { playerToken: data.player_token, username: data.username } : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx vitest run lib/account-db.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/lib/account-db.ts apps/api/lib/account-db.test.ts
git commit -m "Add server-side Supabase token verification and account linking DB access"
```

---

### Task 5: `POST /api/account/link`

**Files:**
- Create: `apps/api/app/api/account/link/route.ts`

**Interfaces:**
- Consumes: `getPlayerByToken` from `@/lib/online-db`; `verifyAccessToken`, `linkAccount` from `@/lib/account-db`.
- Produces: `POST /api/account/link` — request `{ playerToken: string; accessToken: string }`, response `{ ok: true }` on success.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { linkAccount, verifyAccessToken } from "@/lib/account-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { playerToken?: unknown; accessToken?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { playerToken, accessToken } = body;
  if (typeof playerToken !== "string" || !UUID_RE.test(playerToken) || typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(playerToken);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const verified = await verifyAccessToken(accessToken);
    if (!verified) return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });

    await linkAccount(playerToken, verified.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/api/account/link/route.ts
git commit -m "Add POST /api/account/link"
```

---

### Task 6: `POST /api/account/recover`

**Files:**
- Create: `apps/api/app/api/account/recover/route.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`, `getPlayerByAuthUserId` from `@/lib/account-db`.
- Produces: `POST /api/account/recover` — request `{ accessToken: string }`, response `{ found: true; playerToken: string; username: string }` or `{ found: false }`.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getPlayerByAuthUserId, verifyAccessToken } from "@/lib/account-db";

type Body = { accessToken?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { accessToken } = body;
  if (typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const verified = await verifyAccessToken(accessToken);
    if (!verified) return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });

    const player = await getPlayerByAuthUserId(verified.id);
    if (!player) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, playerToken: player.playerToken, username: player.username });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full apps/api test suite**

Run: `cd apps/api && npx vitest run`
Expected: all tests pass, including the new `account-db.test.ts` alongside every test from the Core plan and pre-existing ones.

- [ ] **Step 4: Commit**

```bash
git add apps/api/app/api/account/recover/route.ts
git commit -m "Add POST /api/account/recover"
```

---

### Task 7: Client API wrapper

**Files:**
- Create: `apps/web/src/lib/account-api.ts`

**Interfaces:**
- Consumes: `apiBaseUrl` from `./api-base-url`.
- Produces: `linkAccount(playerToken: string, accessToken: string): Promise<boolean>`, `type RecoverResult = { found: true; playerToken: string; username: string } | { found: false }`, `recoverAccount(accessToken: string): Promise<RecoverResult>`.

- [ ] **Step 1: Write the wrapper**

```typescript
import { apiBaseUrl } from "./api-base-url";

export async function linkAccount(playerToken: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/account/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken, accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type RecoverResult = { found: true; playerToken: string; username: string } | { found: false };

export async function recoverAccount(accessToken: string): Promise<RecoverResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/account/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (!res.ok) return { found: false };
    return (await res.json()) as RecoverResult;
  } catch {
    return { found: false };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/account-api.ts
git commit -m "Add account-linking client API wrapper"
```

---

### Task 8: Auto-recovery inside `loadIdentity()`

**Files:**
- Modify: `apps/web/src/lib/online-storage.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase-client` (Task 3); `recoverAccount` from `./account-api` (Task 7).
- Produces: `loadIdentity()`'s signature (`Promise<Identity | null>`) and behavior when a local identity already exists are **unchanged** — every existing caller (`OnlineScreen.tsx`, and the sibling Core plan's `ChallengeScreen.tsx`) needs zero changes. Only the "no local identity yet" path gains a recovery attempt before returning `null`.

- [ ] **Step 1: Modify `loadIdentity`**

In `apps/web/src/lib/online-storage.ts`, replace the existing `loadIdentity` function:

```typescript
export async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.token === "string" && typeof parsed?.username === "string") return parsed;
    }
  } catch {
    return null;
  }

  // No local identity yet — if this device has an active Supabase Auth
  // session from a previously-linked account (see SettingsScreen's
  // "Hesabını Bağla"), recover that identity instead of the caller
  // falling through to registering a brand-new one. A network/API
  // failure here just means "no recovery today" — never throws, matching
  // this function's existing all-paths-return-or-null contract.
  try {
    const { supabase } = await import("./supabase-client");
    const { recoverAccount } = await import("./account-api");
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return null;

    const result = await recoverAccount(accessToken);
    if (!result.found) return null;

    const identity: Identity = { token: result.playerToken, username: result.username };
    await saveIdentity(identity);
    return identity;
  } catch {
    return null;
  }
}
```

(Dynamic `import()` for `supabase-client`/`account-api` — rather than top-level imports — keeps this module's cost at zero for the common case where `EXPO_PUBLIC_SUPABASE_URL` isn't set at all, and avoids a circular-import risk since `account-api.ts` has no reason to import from `online-storage.ts`, but keeping the import lazy is a cheap safeguard against ever introducing one by accident later.)

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Manual smoke test — unlinked player unaffected**

With no Supabase session ever created on the test device (fresh install, or `.env.local` unset), open the app and confirm Daily Challenge registration/play works exactly as before — `loadIdentity()` should still simply return `null` on first launch, same as today, with the new code path adding an extra (harmless, fast-failing) branch that resolves to `null` immediately since `data.session` is `null`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/online-storage.ts
git commit -m "Add Supabase-session-based identity recovery to loadIdentity()"
```

---

### Task 9: Google sign-in

**Files:**
- Create: `apps/web/src/lib/account-auth.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase-client`.
- Produces: `signInWithGoogle(): Promise<{ accessToken: string } | null>` (returns `null` on cancellation/failure — the caller, Task 12, treats that as "user backed out", not an error to surface loudly).

- [ ] **Step 1: Write the Google sign-in flow**

```typescript
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase-client";

const REDIRECT_URL = Linking.createURL("auth-callback");

/** Web-based OAuth via Supabase — supabase.auth.signInWithOAuth returns a
 * provider URL (skipBrowserRedirect:true stops it trying to redirect the
 * calling context itself, which doesn't exist in React Native), which is
 * then opened in an in-app browser tab via expo-web-browser. That tab
 * redirects back to REDIRECT_URL (registered in the Supabase dashboard,
 * Task 1 Step 4) with the session tokens in the URL fragment once Google
 * sign-in completes. */
export async function signInWithGoogle(): Promise<{ accessToken: string } | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) return null;

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
  if (result.type !== "success" || !result.url) return null;

  // expo-linking's parse() returns { scheme, hostname, path, queryParams }
  // — NOT { params, errorCode }, which don't exist on its real return type.
  const { queryParams } = Linking.parse(result.url.replace("#", "?"));
  const accessToken = queryParams?.access_token;
  const refreshToken = queryParams?.refresh_token;
  if (queryParams?.error || typeof accessToken !== "string" || typeof refreshToken !== "string") return null;

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) return null;

  return { accessToken };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/account-auth.ts
git commit -m "Add Google sign-in flow"
```

---

### Task 10: Apple sign-in

**Files:**
- Modify: `apps/web/src/lib/account-auth.ts`
- Modify: `apps/web/app.json`

**Interfaces:**
- Produces: `signInWithApple(): Promise<{ accessToken: string } | null>` (same contract as `signInWithGoogle`), added to `account-auth.ts` alongside it. `isAppleSignInAvailable(): Promise<boolean>` (Apple's own SDK requirement: the button must only render where `AppleAuthentication.isAvailableAsync()` is true — iOS only, and only on devices/OS versions that support it).

- [ ] **Step 1: Register the `expo-apple-authentication` plugin**

Add to `apps/web/app.json`'s `expo.plugins` array (alongside the existing `expo-router`, `expo-splash-screen`, etc. entries):

```json
"expo-apple-authentication"
```

- [ ] **Step 2: Add the Apple sign-in flow**

Append to `apps/web/src/lib/account-auth.ts`:

```typescript
import * as AppleAuthentication from "expo-apple-authentication";

export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Native Sign In With Apple — required (not the web OAuth popup
 * signInWithGoogle uses) whenever another third-party sign-in is offered,
 * per App Store guidelines. AppleAuthentication.signInAsync returns an
 * identityToken Supabase can verify directly via signInWithIdToken —
 * no browser round-trip needed at all. */
export async function signInWithApple(): Promise<{ accessToken: string } | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return null;

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error || !data.session) return null;

    return { accessToken: data.session.access_token };
  } catch {
    return null; // includes the user cancelling the native sheet
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/account-auth.ts apps/web/app.json
git commit -m "Add Apple sign-in flow"
```

---

### Task 11: Email magic-link sign-in and deep-link handler

**Files:**
- Modify: `apps/web/src/lib/account-auth.ts`
- Create: `apps/web/src/components/AccountLinkDeepLinkHandler.tsx`
- Modify: `apps/web/src/app/_layout.tsx`

**Interfaces:**
- Produces: `sendMagicLink(email: string): Promise<boolean>` (added to `account-auth.ts`), `<AccountLinkDeepLinkHandler />` (a native-only, render-nothing effect component mirroring `PushRegistration`'s existing shape) that completes the session when the emailed link reopens the app, and calls a caller-supplied callback once linking succeeds via that path specifically (magic-link is the one flow that completes *after* the screen that initiated it may have unmounted, since the user leaves the app to check email).

- [ ] **Step 1: Add the magic-link send function**

Append to `apps/web/src/lib/account-auth.ts`:

```typescript
import * as Linking from "expo-linking";

const MAGIC_LINK_REDIRECT = Linking.createURL("auth-callback");

export async function sendMagicLink(email: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: MAGIC_LINK_REDIRECT },
  });
  return !error;
}
```

(`Linking` is already imported at the top of this file from Task 9 — don't duplicate the import, just reuse `REDIRECT_URL`/rename it to a shared constant used by both Google OAuth and the magic link, since they're the same URL: `guess321://auth-callback`.)

- [ ] **Step 2: Write the deep-link handler component**

```tsx
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase-client";

/** No-op on web — magic-link/OAuth deep-linking back into a native app is
 * the whole point here; web already has normal browser session handling
 * via Supabase's own detectSessionInUrl (unused in this app, since
 * Account Linking is native-only per this plan's Global Constraints).
 * Mirrors PushRegistration.tsx's shape: a render-nothing effect component
 * mounted once in _layout.tsx. Handles BOTH the case where the app was
 * already running (the 'url' event) and the case where tapping the email
 * link launched the app fresh (getInitialURL). */
export function AccountLinkDeepLinkHandler() {
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    async function completeSession(url: string) {
      // See Task 9's signInWithGoogle for why this destructures queryParams,
      // not params/errorCode — the latter don't exist on Linking.parse's
      // real return type ({ scheme, hostname, path, queryParams }).
      const { queryParams } = Linking.parse(url.replace("#", "?"));
      const accessToken = queryParams?.access_token;
      const refreshToken = queryParams?.refresh_token;
      if (queryParams?.error || typeof accessToken !== "string" || typeof refreshToken !== "string") return;
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    Linking.getInitialURL().then((url) => {
      if (url) void completeSession(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => void completeSession(url));
    return () => subscription.remove();
  }, []);

  return null;
}
```

- [ ] **Step 3: Mount it in `_layout.tsx`**

Add the import and render it alongside `PushRegistration`:

```tsx
import { AccountLinkDeepLinkHandler } from '@/components/AccountLinkDeepLinkHandler';
```

```tsx
<AnimatedSplashOverlay />
<PushRegistration />
<AccountLinkDeepLinkHandler />
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/account-auth.ts apps/web/src/components/AccountLinkDeepLinkHandler.tsx apps/web/src/app/_layout.tsx
git commit -m "Add email magic-link sign-in and its deep-link handler"
```

---

### Task 12: Settings screen — "Hesabını Bağla"

**Files:**
- Modify: `apps/web/src/components/SettingsScreen.tsx`
- Modify: `apps/web/src/locales/tr.json`, `apps/web/src/locales/en.json`

**Interfaces:**
- Consumes: `signInWithGoogle`, `signInWithApple`, `isAppleSignInAvailable`, `sendMagicLink` from `../lib/account-auth`; `linkAccount` from `../lib/account-api`; `loadIdentity` from `../lib/online-storage` (already imported nowhere in `SettingsScreen.tsx` today — this task adds it).

- [ ] **Step 1: Add i18n keys**

Add to `apps/web/src/locales/tr.json`'s `"settings"` namespace:

```json
"accountLinking": {
  "heading": "Hesabını Bağla",
  "description": "Cihaz değiştirince kullanıcı adını ve geçmişini kaybetme.",
  "google": "Google ile Bağla",
  "apple": "Apple ile Bağla",
  "emailPlaceholder": "E-posta adresin",
  "sendEmailLink": "Bağlantı Gönder",
  "emailSent": "E-postana bir bağlantı gönderdik — açman yeterli.",
  "linked": "Bağlandı ✓",
  "linkFailed": "Bağlanamadı, tekrar dene."
}
```

Mirror to `en.json`:

```json
"accountLinking": {
  "heading": "Link Your Account",
  "description": "Don't lose your username and history when you switch devices.",
  "google": "Link with Google",
  "apple": "Link with Apple",
  "emailPlaceholder": "Your email address",
  "sendEmailLink": "Send Link",
  "emailSent": "We sent a link to your email — just open it.",
  "linked": "Linked ✓",
  "linkFailed": "Couldn't link, try again."
}
```

- [ ] **Step 2: Add the section**

`SettingsScreen.tsx` currently has no local state (`useState`/`useEffect` aren't imported). Add `import { useEffect, useState } from 'react';` to its imports, and `import { isAppleSignInAvailable, sendMagicLink, signInWithApple, signInWithGoogle } from '../lib/account-auth';` and `import { linkAccount } from '../lib/account-api';` and `import { loadIdentity } from '../lib/online-storage';`. Then add state and handlers:

```tsx
const [appleAvailable, setAppleAvailable] = useState(false);
const [email, setEmail] = useState('');
const [linkStatus, setLinkStatus] = useState<'idle' | 'linked' | 'emailSent' | 'failed'>('idle');

useEffect(() => {
  isAppleSignInAvailable().then(setAppleAvailable);
}, []);

async function completeLink(result: { accessToken: string } | null) {
  if (!result) {
    setLinkStatus('failed');
    return;
  }
  const identity = await loadIdentity();
  if (!identity) {
    setLinkStatus('failed');
    return;
  }
  const ok = await linkAccount(identity.token, result.accessToken);
  setLinkStatus(ok ? 'linked' : 'failed');
}

async function handleGoogleLink() {
  await completeLink(await signInWithGoogle());
}

async function handleAppleLink() {
  await completeLink(await signInWithApple());
}

async function handleEmailLink() {
  if (!email.trim()) return;
  const sent = await sendMagicLink(email.trim());
  setLinkStatus(sent ? 'emailSent' : 'failed');
  // Completion for this path happens later, out-of-band, via
  // AccountLinkDeepLinkHandler + loadIdentity()'s recovery check the next
  // time the identity is loaded — there is no accessToken to call
  // linkAccount with yet at THIS point, since the user hasn't opened the
  // email. This screen's job for email is just "send it" — actually
  // completing the link (calling POST /api/account/link) requires the
  // player to be signed in with that email's session, which only exists
  // after they tap the emailed link and AccountLinkDeepLinkHandler calls
  // supabase.auth.setSession. Wire that completion here too so this
  // screen finishes the loop instead of only Task 8's read-only recovery
  // path benefiting: poll for a session having appeared.
}
```

- [ ] **Step 3: Complete the email flow properly**

The comment in Step 2's `handleEmailLink` flags a real gap: sending the magic link isn't enough — once the user taps it (elsewhere, possibly after backgrounding the app), this same screen (if still mounted) should notice the new session and call `linkAccount`. Replace `handleEmailLink` and add an effect:

```tsx
useEffect(() => {
  if (linkStatus !== 'emailSent') return;
  const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) return;
    await completeLink({ accessToken: session.access_token });
  });
  return () => subscription.subscription.unsubscribe();
}, [linkStatus]);

async function handleEmailLink() {
  if (!email.trim()) return;
  const sent = await sendMagicLink(email.trim());
  setLinkStatus(sent ? 'emailSent' : 'failed');
}
```

Add `import { supabase } from '../lib/supabase-client';` to this file's imports.

- [ ] **Step 4: Render the UI**

Add to `SettingsScreen`'s JSX, after the existing `privacyLink`/`termsLink` block:

```tsx
<View className="mt-8 gap-3">
  <Text className="text-lg font-bold text-arena-text">{t('accountLinking.heading')}</Text>
  <Text className="text-sm text-arena-text-soft">{t('accountLinking.description')}</Text>

  {linkStatus === 'linked' ? (
    <Text className="text-base font-semibold text-arena-accent-2">{t('accountLinking.linked')}</Text>
  ) : (
    <View className="gap-3">
      <ArenaPressable
        onPress={() => void handleGoogleLink()}
        className="items-center rounded-xl border-b-[6px] border-arena-accent-strong bg-arena-accent py-4"
      >
        <Text className="text-base font-bold text-[#2A1E00]">{t('accountLinking.google')}</Text>
      </ArenaPressable>

      {appleAvailable && (
        <ArenaPressable onPress={() => void handleAppleLink()} className="items-center rounded-xl border border-arena-text py-4">
          <Text className="text-base font-bold text-arena-text">{t('accountLinking.apple')}</Text>
        </ArenaPressable>
      )}

      <View className="flex-row gap-2">
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('accountLinking.emailPlaceholder')}
          placeholderTextColor="#8FE8C4"
          autoCapitalize="none"
          keyboardType="email-address"
          className="flex-1 rounded-xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-3 text-base text-arena-text"
        />
        <ArenaPressable onPress={() => void handleEmailLink()} className="items-center justify-center rounded-xl bg-arena-accent-2 px-4">
          <Text className="text-sm font-bold text-[#04231A]">{t('accountLinking.sendEmailLink')}</Text>
        </ArenaPressable>
      </View>

      {linkStatus === 'emailSent' && <Text className="text-sm text-arena-accent-2">{t('accountLinking.emailSent')}</Text>}
      {linkStatus === 'failed' && <Text className="text-sm text-red-400">{t('accountLinking.linkFailed')}</Text>}
    </View>
  )}
</View>
```

Add `TextInput` to this file's `react-native` import, and the auth imports from Step 2/3.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SettingsScreen.tsx apps/web/src/locales/tr.json apps/web/src/locales/en.json
git commit -m "Add account linking UI to the Settings screen"
```

---

### Task 13: End-to-end manual test and final regression

**Files:** none (verification-only task)

- [ ] **Step 1: Google link + recovery test**

On a native simulator/device with a fresh install (no local identity): register a username via Daily Challenge, go to Settings, tap "Google ile Bağla", complete the Google sign-in flow, confirm `accountLinking.linked` shows. Delete and reinstall the app (or clear AsyncStorage), confirm the app auto-recovers the same username the next time `loadIdentity()` runs — no fresh registration.

- [ ] **Step 2: Apple link test**

Same as Step 1 but with "Apple ile Bağla" — only testable on an iOS device (Apple's own SDK requirement), never a simulator issue but confirm `isAppleSignInAvailable()` correctly hides the button on Android.

- [ ] **Step 3: Email magic-link test**

Tap "Bağlantı Gönder" with a real test email, background the app, open the emailed link on the same device, confirm the app foregrounds (or launches) and `linkStatus` transitions to `linked` without any further tap needed in the app itself.

- [ ] **Step 4: Confirm zero regression for unlinked players**

On a separate fresh install, never touch account linking at all — play Daily Challenge and (once the Core plan is implemented) Challenge Mode normally, confirm nothing about that experience changed.

- [ ] **Step 5: Full test suite**

Run: `cd apps/api && npx vitest run && npx tsc --noEmit`
Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: everything passes.

No commit for this task (verification only).

## Self-Review Notes

- **Spec coverage:** the spec's Account Linking section (Supabase Auth, all three providers, `auth_user_id` recovery) is fully covered — provider setup (Task 1), client SDK (Tasks 2–3), server verification/linking (Tasks 4–6), all three sign-in flows (Tasks 9–11), recovery (Task 8), UI (Task 12).
- **Gap found and fixed during self-review:** the spec doesn't spell out that sending a magic link and *completing* it are two separate moments (the user leaves the app in between) — Task 12 Step 3 adds an `onAuthStateChange` listener so the Settings screen itself finishes the link once the emailed session appears, rather than only benefiting the next `loadIdentity()` recovery check (Task 8), which would otherwise be the only path that actually calls `linkAccount` for the email flow.
- **Type consistency check:** `signInWithGoogle`/`signInWithApple`/`sendMagicLink`'s shared `{ accessToken: string } | null` return shape (Tasks 9–10) is used identically by `completeLink` in Task 12 — no mismatch between what those functions return and what the Settings screen expects.
