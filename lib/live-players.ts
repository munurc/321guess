import type { Player, Round } from "./types";

/**
 * Ask the /api/round edge function for the authoritative player list for this
 * round straight from Wikidata. Falls through to the caller's local snapshot
 * if the request fails (network, 5xx, timeout — anything).
 */
export async function fetchLiveRoundPlayers(
  round: Round,
  signal?: AbortSignal,
): Promise<Player[] | null> {
  const body =
    round.kind === "clubClub"
      ? { mode: "clubClub", clubA: round.clubA.id, clubB: round.clubB.id }
      : { mode: "countryClub", club: round.club.id, countryCode: round.country.code };
  try {
    const res = await fetch("/api/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { players?: Player[] };
    return Array.isArray(data.players) ? data.players : null;
  } catch {
    return null;
  }
}
