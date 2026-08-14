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
