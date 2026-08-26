import { getPushTokensForPlayer } from "./push-db";
import { sendPushToTokens } from "./fcm";

/** Best-effort push to one player's device(s) — used for "X sana meydan
 * okudu" and "sonucun hazır" notifications, triggered inline from
 * /api/challenges/send and /api/challenges/[id]/finish rather than from a
 * cron (contrast lib/fcm.ts's sendDailyBroadcast, which the daily cron
 * calls). Never throws: a push failure must not fail the API call that
 * triggered it — the in-app hub list (GET /api/challenges/list) is always
 * the source of truth regardless of whether this succeeds. */
export async function notifyPlayer(playerToken: string, title: string, body: string): Promise<void> {
  try {
    const tokens = await getPushTokensForPlayer(playerToken);
    if (tokens.length === 0) return;
    await sendPushToTokens(tokens, title, body);
  } catch {
    // Best-effort — see doc comment above.
  }
}
