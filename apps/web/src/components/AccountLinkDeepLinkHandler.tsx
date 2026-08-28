import { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { getSupabaseClient } from "../lib/supabase-client";
import { AUTH_CALLBACK_REDIRECT_URL } from "../lib/account-auth";

const EXPECTED_PATH = Linking.parse(AUTH_CALLBACK_REDIRECT_URL).path;

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
      const parsed = Linking.parse(url.replace("#", "?"));
      // Any app matching this URL scheme can be launched with an arbitrary
      // deep link — without this check, a malicious link carrying someone
      // else's access/refresh token would make this device sign in as
      // them, and completeLink (Task 12) would then link the local
      // player_token to the attacker's account.
      if (parsed.path !== EXPECTED_PATH) return;
      const { queryParams } = parsed;
      const accessToken = queryParams?.access_token;
      const refreshToken = queryParams?.refresh_token;
      if (queryParams?.error || typeof accessToken !== "string" || typeof refreshToken !== "string") return;
      await getSupabaseClient().auth.setSession({
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
