import { getSupabaseServerClient } from "./supabase";

export type PushPlatform = "ios" | "android";

export async function upsertPushToken(
  deviceToken: string,
  platform: PushPlatform,
  playerToken: string | null,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("push_tokens").upsert(
    {
      device_token: deviceToken,
      platform,
      player_token: playerToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_token" },
  );
  if (error) throw error;
}

export type PushTokenRow = { deviceToken: string; platform: PushPlatform };

export async function getAllPushTokens(): Promise<PushTokenRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("push_tokens").select("device_token, platform");
  if (error) throw error;
  return (data ?? []).map((row) => ({ deviceToken: row.device_token, platform: row.platform }));
}

export async function deletePushTokens(deviceTokens: string[]): Promise<void> {
  if (deviceTokens.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("push_tokens").delete().in("device_token", deviceTokens);
  if (error) throw error;
}
