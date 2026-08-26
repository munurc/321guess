import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/challenge-db";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ usernames: [] });

  try {
    const results = await searchPlayers(q.trim(), 8);
    return NextResponse.json({ usernames: results.map((r) => r.username) });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
