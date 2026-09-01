import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getSupabaseClient } from "./supabase-client";

/** Shared by both Google OAuth and the email magic link below — they're
 * the same URL: guess321://auth-callback. Exported so
 * AccountLinkDeepLinkHandler can verify an incoming deep link is actually
 * this callback before trusting any token in its query string. */
export const AUTH_CALLBACK_REDIRECT_URL = Linking.createURL("auth-callback");

/** Guards AccountLinkDeepLinkHandler against an unsolicited deep link:
 * matching the auth-callback path alone isn't enough, since anyone can
 * craft `guess321://auth-callback?access_token=...` carrying a REAL
 * access/refresh token pair for an account they themselves control (e.g.
 * their own throwaway Google sign-in), and get a victim to tap it — the
 * device would then sign in as the attacker, which the Settings screen's
 * onAuthStateChange listener auto-links to the victim's real identity.
 * sendMagicLink sets this immediately before requesting the email;
 * AccountLinkDeepLinkHandler requires it to be present and fresh before
 * accepting any token from a deep link, and always consumes it (single
 * use) so a second, unsolicited link can't ride the same window.
 * Google/Apple sign-in never go through the global deep-link listener at
 * all (Google's tokens are captured directly by the awaited
 * WebBrowser.openAuthSessionAsync call in signInWithGoogle below; Apple's
 * flow is native, no deep link involved), so only the magic-link path
 * needs this. */
export const PENDING_MAGIC_LINK_KEY = "321guess.pendingMagicLinkAt";
const MAGIC_LINK_WINDOW_MS = 20 * 60 * 1000; // Supabase's default OTP link expiry is 1h; this is intentionally tighter.

export async function hasPendingMagicLink(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PENDING_MAGIC_LINK_KEY);
  if (!raw) return false;
  const requestedAt = Number(raw);
  return Number.isFinite(requestedAt) && Date.now() - requestedAt < MAGIC_LINK_WINDOW_MS;
}

export async function clearPendingMagicLink(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_MAGIC_LINK_KEY);
}

/** Web-based OAuth via Supabase — supabase.auth.signInWithOAuth returns a
 * provider URL (skipBrowserRedirect:true stops it trying to redirect the
 * calling context itself, which doesn't exist in React Native), which is
 * then opened in an in-app browser tab via expo-web-browser. That tab
 * redirects back to AUTH_CALLBACK_REDIRECT_URL (registered in the Supabase dashboard,
 * Task 1 Step 4) with the session tokens in the URL fragment once Google
 * sign-in completes. */
export async function signInWithGoogle(): Promise<{ accessToken: string } | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_CALLBACK_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) return null;

  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_CALLBACK_REDIRECT_URL);
  if (result.type !== "success" || !result.url) return null;

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

    const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error || !data.session) return null;

    return { accessToken: data.session.access_token };
  } catch {
    return null; // includes the user cancelling the native sheet
  }
}

export async function sendMagicLink(email: string): Promise<boolean> {
  await AsyncStorage.setItem(PENDING_MAGIC_LINK_KEY, String(Date.now()));
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_CALLBACK_REDIRECT_URL },
  });
  if (error) await clearPendingMagicLink();
  return !error;
}
