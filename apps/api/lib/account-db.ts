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

/** Postgres's unique_violation code — thrown by the partial unique index on
 * auth_user_id (see challenges.sql) when this Supabase account is already
 * linked to a DIFFERENT player_token. Without that index and this check,
 * two local identities could both end up pointing at the same auth_user_id,
 * and getPlayerByAuthUserId's .maybeSingle() would then throw on every
 * future recovery attempt for that account — permanently, since nothing
 * about that state fixes itself. */
const UNIQUE_VIOLATION = "23505";

/** Only sets auth_user_id when the player has none yet (.is("auth_user_id",
 * null)) — otherwise anyone holding a player_token whose identity was
 * already linked to a real account could silently re-point it at an
 * account they control, permanently cutting off the original owner's
 * recovery (a rare form of account takeover this app's player_token-only
 * auth model would otherwise permit). Re-linking to a different account
 * needs its own explicit unlink flow, not this endpoint. */
export async function linkAccount(playerToken: string, authUserId: string): Promise<"ok" | "already_linked"> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .update({ auth_user_id: authUserId })
    .eq("player_token", playerToken)
    .is("auth_user_id", null)
    .select("player_token");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return "already_linked";
    throw error;
  }
  if (!data || data.length === 0) return "already_linked";
  return "ok";
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
