import { getSupabaseServerClient } from "../lib/supabase";

const username = process.argv[2];
if (!username) {
  console.error("Usage: tsx scripts/delete-online-player.ts <username>");
  process.exit(1);
}

async function main() {
  const supabase = getSupabaseServerClient();

  const { data: player, error: findError } = await supabase
    .from("online_players")
    .select("player_token, username")
    .eq("username", username)
    .maybeSingle();
  if (findError) throw findError;
  if (!player) {
    console.log(`No player found with username "${username}".`);
    return;
  }

  const token = player.player_token;

  // Challenge Mode rows reference online_players, so they must go first.
  // A challenge the player created or was matched into is deleted whole
  // (with its questions/guesses/scores) — it can't be played without them.
  const { data: challengeRows, error: challengesError } = await supabase
    .from("challenges")
    .select("id")
    .or(`creator_token.eq.${token},opponent_token.eq.${token}`);
  if (challengesError) throw challengesError;
  const challengeIds = (challengeRows ?? []).map((c) => c.id);
  for (const table of ["challenge_guesses", "challenge_scores"]) {
    const { error } = await supabase.from(table).delete().eq("player_token", token);
    if (error) throw error;
  }
  if (challengeIds.length > 0) {
    for (const table of ["challenge_guesses", "challenge_scores", "challenge_questions"]) {
      const { error } = await supabase.from(table).delete().in("challenge_id", challengeIds);
      if (error) throw error;
    }
    const { error } = await supabase.from("challenges").delete().in("id", challengeIds);
    if (error) throw error;
  }
  const { error: rivalriesError } = await supabase
    .from("rivalries")
    .delete()
    .or(`player_a_token.eq.${token},player_b_token.eq.${token}`);
  if (rivalriesError) throw rivalriesError;

  for (const table of ["daily_starts", "daily_guesses", "daily_scores", "streaks"]) {
    const { error } = await supabase.from(table).delete().eq("player_token", token);
    if (error) throw error;
  }
  // Unlink rather than delete: the device should keep receiving the daily
  // broadcast push even after its player identity is gone.
  const { error: unlinkPushError } = await supabase
    .from("push_tokens")
    .update({ player_token: null })
    .eq("player_token", token);
  if (unlinkPushError) throw unlinkPushError;

  const { error: deletePlayerError } = await supabase.from("online_players").delete().eq("player_token", token);
  if (deletePlayerError) throw deletePlayerError;

  console.log(`Deleted player "${username}" (${token}) and all associated rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
