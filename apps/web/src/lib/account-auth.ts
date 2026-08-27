import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase-client";

/** Shared by both Google OAuth and the email magic link below — they're
 * the same URL: guess321://auth-callback. */
const AUTH_CALLBACK_REDIRECT_URL = Linking.createURL("auth-callback");

/** Web-based OAuth via Supabase — supabase.auth.signInWithOAuth returns a
 * provider URL (skipBrowserRedirect:true stops it trying to redirect the
 * calling context itself, which doesn't exist in React Native), which is
 * then opened in an in-app browser tab via expo-web-browser. That tab
 * redirects back to AUTH_CALLBACK_REDIRECT_URL (registered in the Supabase dashboard,
 * Task 1 Step 4) with the session tokens in the URL fragment once Google
 * sign-in completes. */
export async function signInWithGoogle(): Promise<{ accessToken: string } | null> {
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

export async function sendMagicLink(email: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_CALLBACK_REDIRECT_URL },
  });
  return !error;
}
