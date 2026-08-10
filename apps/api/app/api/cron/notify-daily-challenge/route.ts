// firebase-admin needs Node APIs (crypto signing for OAuth2) — not available
// on the Edge runtime.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ensureDailyRound, todayRoundDate } from "@/lib/daily-round";
import { deletePushTokens, getAllPushTokens } from "@/lib/push-db";
import { sendDailyBroadcast } from "@/lib/fcm";

/**
 * Runs once a day via Vercel Cron (see vercel.json). Makes sure today's
 * round exists (idempotent — a no-op read if a visitor already triggered
 * creation via GET /api/online/round) and then sends the generic
 * "today's challenge is ready" push to every registered device.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const roundDate = todayRoundDate();

  try {
    await ensureDailyRound(roundDate);

    const tokens = await getAllPushTokens();
    const result = await sendDailyBroadcast(tokens.map((t) => t.deviceToken));
    if (result.invalidTokens.length > 0) await deletePushTokens(result.invalidTokens);

    return NextResponse.json({
      ok: true,
      roundDate,
      sent: result.successCount,
      invalidRemoved: result.invalidTokens.length,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
