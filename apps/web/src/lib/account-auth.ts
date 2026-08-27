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
