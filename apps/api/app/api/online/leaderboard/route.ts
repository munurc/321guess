import { NextResponse, type NextRequest } from "next/server";
import { todayRoundDate } from "@/lib/daily-round";
import { getTodayLeaderboard, getTotalLeaderboard } from "@/lib/online-db";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") === "total" ? "total" : "today";

  try {
    if (type === "total") {
      const entries = await getTotalLeaderboard();
      return NextResponse.json({ type, entries });
    }
    const roundDate = todayRoundDate();
    const entries = await getTodayLeaderboard(roundDate);
    return NextResponse.json({ type, roundDate, entries });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
