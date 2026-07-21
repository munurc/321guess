import { NextResponse } from "next/server";
import type { Player } from "@/lib/types";

/**
 * Round-time player fetch.
 *
 * Instead of shipping a 7 MB `players.json` and rebuilding weekly, this endpoint
 * asks Wikidata for the exact intersection needed for the current round. A
 * single self-join SPARQL query returns the players who have a P54 statement
 * to both clubs (Club × Club) or one specific club + a nationality (Country ×
 * Club), skipping only deprecated-rank statements.
 *
 * The response is cached at the Vercel edge for 24 hours per unique query, so
 * a hit round pays ~2 s once and then serves from cache in ~100 ms. Fresh
 * transfers land here as soon as Wikidata is updated by volunteers.
 *
 * The client falls back to the local players.json snapshot when this endpoint
 * fails (Wikidata down, rate-limited, etc.).
 */

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "321guess/1.0 (https://321guess.com; https://github.com/munurc/321guess)";

export const runtime = "edge";

type Body =
  | { mode: "clubClub"; clubA: string; clubB: string }
  | { mode: "countryClub"; club: string; countryCode: string };

type SparqlResult = {
  results: { bindings: Array<Record<string, { value: string } | undefined>> };
};

function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

async function runSparql(query: string): Promise<SparqlResult> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "query=" + encodeURIComponent(query),
    // Wikidata WQS has a 60s hard timeout; let the runtime enforce sooner.
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return JSON.parse(stripControlChars(await res.text())) as SparqlResult;
}

// Wikidata's SPARQL query planner chokes when a broad club-intersection is
// joined with the (very large) P27 → P297 country-code chain in a single go
// — it times out at ~60 s. Splitting into two passes is dramatically faster:
//   1. Just the intersection IDs (~1 s, small set)
//   2. VALUES ?player { … } + label + nationality on that small set (~1 s)

function clubClubIdsQuery(aQid: string, bQid: string): string {
  return `
    SELECT DISTINCT ?player WHERE {
      ?player p:P54 ?s1.
      ?s1 ps:P54 wd:${aQid}.
      ?s1 wikibase:rank ?r1.
      FILTER(?r1 != wikibase:DeprecatedRank)
      ?player p:P54 ?s2.
      ?s2 ps:P54 wd:${bQid}.
      ?s2 wikibase:rank ?r2.
      FILTER(?r2 != wikibase:DeprecatedRank)
    }
    LIMIT 400
  `;
}

function countryClubIdsQuery(clubQid: string, countryCode: string): string {
  return `
    SELECT DISTINCT ?player WHERE {
      ?player p:P54 ?s.
      ?s ps:P54 wd:${clubQid}.
      ?s wikibase:rank ?rank.
      FILTER(?rank != wikibase:DeprecatedRank)
      ?player wdt:P27 ?nationality.
      ?nationality wdt:P297 "${countryCode}".
    }
    LIMIT 400
  `;
}

function metadataQuery(playerQids: string[]): string {
  const values = playerQids.map((q) => `wd:${q}`).join(" ");
  // Dual-citizen players (Messi has AR + ES, Ronaldinho AR + ES via qualifiers)
  // return multiple ?natCode rows. We rank them so ORDER BY brings the primary
  // nationality first, then dedupe on the JS side keeping the first row.
  return `
    SELECT ?player ?trLabel ?enLabel ?natCode ?natOrder WHERE {
      VALUES ?player { ${values} }
      OPTIONAL { ?player rdfs:label ?trLabel. FILTER(LANG(?trLabel) = "tr") }
      OPTIONAL { ?player rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
      OPTIONAL {
        ?player p:P27 ?natStmt.
        ?natStmt ps:P27 ?nationality.
        ?natStmt wikibase:rank ?natRank.
        FILTER(?natRank != wikibase:DeprecatedRank)
        ?nationality wdt:P297 ?natCode.
        BIND(IF(?natRank = wikibase:PreferredRank, 0, 1) AS ?natOrder)
      }
    }
    ORDER BY ?player ?natOrder ?natCode
  `;
}

function isValidQid(s: unknown): s is string {
  return typeof s === "string" && /^Q\d+$/.test(s);
}
function isValidCountryCode(s: unknown): s is string {
  return typeof s === "string" && /^[A-Z]{2}$/.test(s);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = body as Body;

  // ── Pass 1: intersection IDs only ─────────────────────────────────────────
  let idsQuery: string;
  if (b.mode === "clubClub" && isValidQid(b.clubA) && isValidQid(b.clubB)) {
    if (b.clubA === b.clubB) return NextResponse.json({ error: "same_club" }, { status: 400 });
    idsQuery = clubClubIdsQuery(b.clubA, b.clubB);
  } else if (b.mode === "countryClub" && isValidQid(b.club) && isValidCountryCode(b.countryCode)) {
    idsQuery = countryClubIdsQuery(b.club, b.countryCode);
  } else {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let idsData: SparqlResult;
  try {
    idsData = await runSparql(idsQuery);
  } catch (e) {
    return NextResponse.json(
      { error: "wikidata_failed", stage: "ids", message: (e as Error).message },
      { status: 502 },
    );
  }

  const qidRe = /^https?:\/\/www\.wikidata\.org\/entity\//;
  const playerIds = [
    ...new Set(
      idsData.results.bindings
        .map((r) => r.player?.value)
        .filter((v): v is string => !!v)
        .map((v) => v.replace(qidRe, "")),
    ),
  ];

  if (playerIds.length === 0) {
    return NextResponse.json(
      { players: [] },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  }

  // ── Pass 2: labels + nationalities for that small set ─────────────────────
  let metaData: SparqlResult;
  try {
    metaData = await runSparql(metadataQuery(playerIds));
  } catch (e) {
    return NextResponse.json(
      { error: "wikidata_failed", stage: "meta", message: (e as Error).message },
      { status: 502 },
    );
  }

  const seen = new Set<string>();
  const players: Player[] = [];
  for (const row of metaData.results.bindings) {
    const p = row.player?.value;
    const label = row.trLabel?.value ?? row.enLabel?.value;
    if (!p || !label) continue;
    const id = p.replace(qidRe, "");
    if (seen.has(id)) continue;
    seen.add(id);
    const natCode =
      b.mode === "countryClub" ? b.countryCode : row.natCode?.value?.toUpperCase();
    if (!natCode) continue;
    players.push({
      id,
      name: label,
      nationalityCode: natCode,
      clubIds: [],
    });
  }

  players.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    { players },
    {
      headers: {
        // Vercel edge cache — first user pays, subsequent identical rounds served from cache
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
