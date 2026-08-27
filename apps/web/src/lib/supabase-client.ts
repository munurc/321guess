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
