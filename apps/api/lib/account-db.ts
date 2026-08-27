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
