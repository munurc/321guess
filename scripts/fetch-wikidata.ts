/**
 * Fetches football data from Wikidata SPARQL and writes to public/data/*.json.
 * Run with: npm run fetch-data
 *
 * The dataset produced is intentionally scoped to the leagues in target-leagues.ts.
 * A player is included only if they played for at least one club currently in
 * one of those leagues (P118). Their `clubIds` field only lists such "pool" clubs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { targetLeagues } from "./target-leagues";
import type { Club, Country, Dataset, League, Player } from "../lib/types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "321guess-data-fetcher/0.1 (https://github.com/munurcoskun/321guess; player-guessing-game)";

async function sparql<T = unknown>(query: string, label: string): Promise<T> {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: "query=" + encodeURIComponent(query),
      });
      if (res.ok) {
        // Some Wikidata labels contain raw control chars that break JSON.parse.
        // Strip disallowed chars (not tab/newline/CR — those are legal in JSON).
        const text = await res.text();
        const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
        return JSON.parse(cleaned) as T;
      }
      const body = await res.text();
      if (attempt === attempts) {
        throw new Error(
          `SPARQL [${label}] failed after ${attempts} attempts: ${res.status} ${body.slice(0, 300)}`,
        );
      }
      console.warn(
        `[${label}] attempt ${attempt} failed (${res.status}), retrying in ${attempt * 3}s…`,
      );
    } catch (e) {
      // Network / socket errors — treat as retryable.
      if (attempt === attempts) throw e;
      console.warn(
        `[${label}] attempt ${attempt} network error (${(e as Error).message.slice(0, 80)}), retrying in ${attempt * 3}s…`,
      );
    }
    await sleep(attempt * 3000);
  }
  throw new Error("unreachable");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

const qid = (uri: string) => uri.replace(/^https?:\/\/www\.wikidata\.org\/entity\//, "");

type Binding = Record<string, { value: string } | undefined>;
type WdResponse = { results: { bindings: Binding[] } };

// ---------- 1. Leagues + clubs -------------------------------------------------

async function fetchOneLeague(
  leagueQid: string,
): Promise<{ league: League | null; clubs: Club[] }> {
  // Rank clubs by sitelink count (notability) and cap to top 100 per league.
  const query = `
    SELECT DISTINCT ?league ?leagueEn ?leagueTr ?club ?clubEn ?logo ?country ?countryCode WHERE {
      BIND(wd:${leagueQid} AS ?league)
      ?club wdt:P118 ?league.
      # Different clubs live in different taxonomy branches:
      #  - Man Utd, Chelsea, Arsenal → subclass of Q476028 (association football club)
      #  - FC Barcelona → subclass of Q103229495 (men's association football team) → Q12973014 (sports team)
      # Union both so we catch either.
      { ?club wdt:P31/wdt:P279* wd:Q476028. }
      UNION
      { ?club wdt:P31/wdt:P279* wd:Q103229495. }
      OPTIONAL { ?club wdt:P154 ?p154. }
      OPTIONAL { ?club wdt:P41  ?p41. }
      # P18 (image) sometimes holds a stadium/ground photo — only accept it when
      # the filename doesn't smell like one.
      OPTIONAL {
        ?club wdt:P18 ?p18raw.
        FILTER(!REGEX(STR(?p18raw), "(stadi|arena|ground|estadio|stade|stadion|kampen|estadi)", "i"))
        BIND(?p18raw AS ?p18)
      }
      BIND(COALESCE(?p154, ?p41, ?p18) AS ?logo)
      FILTER(BOUND(?logo))
      ?club wdt:P17 ?country.
      ?country wdt:P297 ?countryCode.
      ?club rdfs:label ?clubEn. FILTER(LANG(?clubEn) = "en")
      OPTIONAL {
        ?league rdfs:label ?leagueEn. FILTER(LANG(?leagueEn) = "en")
      }
      OPTIONAL {
        ?league rdfs:label ?leagueTr. FILTER(LANG(?leagueTr) = "tr")
      }
      FILTER(!REGEX(?clubEn, "(reserves?|youth|academy|U-?\\\\d|women)", "i"))
    }
    LIMIT 200
  `;
  const data = await sparql<WdResponse>(query, `league ${leagueQid}`);
  let league: League | null = null;
  const clubs: Club[] = [];
  const seen = new Set<string>();

  for (const b of data.results.bindings) {
    if (!b.league || !b.club || !b.logo || !b.countryCode) continue;
    const leagueId = qid(b.league.value);
    const clubId = qid(b.club.value);
    if (seen.has(clubId)) continue;
    seen.add(clubId);
    const countryCode = b.countryCode.value.toUpperCase();

    if (!league) {
      const meta = targetLeagues.find((l) => l.qid === leagueId);
      // Prefer the hard-coded displayName over Wikidata labels — Wikidata's
      // Turkish/English labels for niche leagues can be dated (e.g. Saudi Pro
      // League returns an Ottoman-era transliteration).
      const nameEn = meta?.displayName ?? b.leagueEn?.value ?? leagueId;
      league = {
        id: leagueId,
        nameEn,
        nameTr: meta?.displayName ?? b.leagueTr?.value ?? nameEn,
        countryCode: meta?.countryCodeHint ?? countryCode,
      };
    }
    clubs.push({
      id: clubId,
      name: b.clubEn?.value ?? clubId,
      logoUrl: b.logo.value,
      leagueId,
      countryCode,
      // Filled in by enrich-popularity.ts as a separate pass; default 0 here.
      popularity: 0,
    });
  }
  return { league, clubs };
}

async function fetchLeaguesAndClubs(): Promise<{ leagues: League[]; clubs: Club[] }> {
  const leagues: League[] = [];
  const clubs: Club[] = [];
  for (const target of targetLeagues) {
    try {
      const { league, clubs: leagueClubs } = await fetchOneLeague(target.qid);
      if (league) {
        leagues.push(league);
        clubs.push(...leagueClubs);
        console.log(`  → ${target.slug.padEnd(18)} ${leagueClubs.length} clubs`);
      } else {
        console.warn(`  ! ${target.slug.padEnd(18)} zero clubs — QID likely wrong`);
      }
    } catch (e) {
      console.warn(`  ! ${target.slug} failed:`, (e as Error).message.slice(0, 200));
    }
    await sleep(500);
  }
  console.log(`  → total: ${leagues.length} leagues, ${clubs.length} clubs`);
  return { leagues, clubs };
}

// ---------- 2. Players (batched by club) --------------------------------------

async function fetchPlayers(clubs: Club[]): Promise<Player[]> {
  // Phase 1: For each club, get up to N player URIs (fast — no joins).
  // Paginate with 2 pages of 400 → up to 800 players per club, avoiding the
  // ORDER BY sitelinks timeout while still catching famous transfers past #400.
  const pageSize = 400;
  const pages = 2;
  const playerClubs = new Map<string, Set<string>>(); // playerId → clubIds

  console.log(`  phase 1: player URIs per club (${pages} pages of ${pageSize})`);
  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    let totalForClub = 0;
    let added = 0;
    for (let page = 0; page < pages; page++) {
      const offset = page * pageSize;
      // Use p:P54/ps:P54 (all-rank statement pattern) so we catch former clubs
      // like Barcelona for Messi — his current-club Inter Miami is "preferred
      // rank", which makes wdt:P54 truthy-hide Barcelona/PSG.
      // Skip only DeprecatedRank statements.
      const query = `SELECT DISTINCT ?player WHERE {
        ?player p:P54 ?stmt.
        ?stmt ps:P54 wd:${club.id}.
        ?stmt wikibase:rank ?rank.
        FILTER(?rank != wikibase:DeprecatedRank)
      } LIMIT ${pageSize} OFFSET ${offset}`;
      const label = `[${(i + 1).toString().padStart(3)}/${clubs.length}] ${club.name} p${page + 1}`;
      let data: WdResponse;
      try {
        data = await sparql<WdResponse>(query, label);
      } catch (e) {
        console.warn(`    ! ${label} skipped: ${(e as Error).message.slice(0, 60)}`);
        await sleep(500);
        continue;
      }
      let pageRows = 0;
      for (const b of data.results.bindings) {
        if (!b.player) continue;
        pageRows++;
        const pid = qid(b.player.value);
        const set = playerClubs.get(pid);
        if (set) set.add(club.id);
        else {
          playerClubs.set(pid, new Set([club.id]));
          added++;
        }
      }
      totalForClub += pageRows;
      // If page returned less than pageSize, no more pages needed.
      if (pageRows < pageSize) break;
      await sleep(200);
    }
    if ((i + 1) % 20 === 0 || i === clubs.length - 1) {
      console.log(`    → [${(i + 1).toString().padStart(3)}/${clubs.length}] ${club.name}: ${totalForClub} rows, +${added} new, unique so far ${playerClubs.size}`);
    }
    await sleep(200);
  }

  // Phase 2: Batch fetch labels + nationality for all unique player IDs.
  const allPids = [...playerClubs.keys()];
  console.log(`  phase 2: metadata for ${allPids.length} unique players`);
  const players = new Map<string, Player>();
  const metaBatchSize = 100;

  for (let i = 0; i < allPids.length; i += metaBatchSize) {
    const batch = allPids.slice(i, i + metaBatchSize);
    const values = batch.map((p) => `wd:${p}`).join(" ");
    const query = `
      SELECT ?player ?playerEn ?natCode WHERE {
        VALUES ?player { ${values} }
        ?player wdt:P27 ?nationality.
        ?nationality wdt:P297 ?natCode.
        ?player rdfs:label ?playerEn.
        FILTER(LANG(?playerEn) = "en")
      }
    `;
    const label = `meta ${i + 1}-${Math.min(i + metaBatchSize, allPids.length)}/${allPids.length}`;
    let data: WdResponse;
    try {
      data = await sparql<WdResponse>(query, label);
    } catch (e) {
      console.warn(`    ! ${label} skipped: ${(e as Error).message.slice(0, 60)}`);
      await sleep(1000);
      continue;
    }
    const seen = new Set<string>();
    for (const b of data.results.bindings) {
      if (!b.player || !b.playerEn || !b.natCode) continue;
      const pid = qid(b.player.value);
      if (seen.has(pid)) continue; // dual-national: keep first
      seen.add(pid);
      const clubsForPlayer = [...(playerClubs.get(pid) ?? [])];
      if (clubsForPlayer.length === 0) continue;
      players.set(pid, {
        id: pid,
        name: b.playerEn.value,
        nationalityCode: b.natCode.value.toUpperCase(),
        clubIds: clubsForPlayer,
      });
    }
    if ((i / metaBatchSize + 1) % 10 === 0 || i + metaBatchSize >= allPids.length) {
      console.log(`    → ${label}: resolved ${players.size}/${allPids.length}`);
    }
    await sleep(400);
  }
  return [...players.values()];
}

// ---------- 3. Countries (flags + labels) --------------------------------------

async function fetchCountries(codes: Set<string>): Promise<Country[]> {
  if (codes.size === 0) return [];
  const codeList = [...codes].map((c) => `"${c}"`).join(" ");
  const query = `
    SELECT DISTINCT ?country ?code ?nameEn ?nameTr ?flag WHERE {
      VALUES ?code { ${codeList} }
      ?country wdt:P297 ?code.
      OPTIONAL { ?country wdt:P41 ?flag. }
      ?country rdfs:label ?nameEn.
      FILTER(LANG(?nameEn) = "en")
      OPTIONAL {
        ?country rdfs:label ?nameTr.
        FILTER(LANG(?nameTr) = "tr")
      }
    }
  `;
  const data = await sparql<WdResponse>(query, "countries");
  const byCode = new Map<string, Country>();
  for (const b of data.results.bindings) {
    if (!b.code || !b.flag) continue;
    const code = b.code.value.toUpperCase();
    if (byCode.has(code)) continue;
    byCode.set(code, {
      code,
      nameEn: b.nameEn?.value ?? code,
      nameTr: b.nameTr?.value ?? b.nameEn?.value ?? code,
      flagUrl: b.flag.value,
    });
  }
  console.log(`  → ${byCode.size}/${codes.size} countries resolved (with flags)`);
  return [...byCode.values()];
}

// ---------- Main ---------------------------------------------------------------

async function fetchExtraPagesForHeavyClubs(
  clubs: Club[],
  existing: Player[],
  // Main fetch already covered pages 0+1 (OFFSET 0 and 400), so supplement
  // begins at page 2 (OFFSET 800). 3 more pages → covers up to OFFSET 2000.
  fromPage = 2,
  pages = 3,
): Promise<Player[]> {
  const pageSize = 400;
  const existingByPid = new Map(existing.map((p) => [p.id, p]));
  // Count how many players each club already has → identify "heavy" clubs.
  const perClubCount = new Map<string, number>();
  for (const p of existing) for (const c of p.clubIds) perClubCount.set(c, (perClubCount.get(c) ?? 0) + 1);
  const heavy = clubs.filter((c) => (perClubCount.get(c.id) ?? 0) >= pageSize);
  console.log(`  supplement: ${heavy.length} heavy clubs (≥${pageSize} players) will get extra pages`);

  const newPlayerClubs = new Map<string, Set<string>>();
  for (let i = 0; i < heavy.length; i++) {
    const club = heavy[i];
    for (let page = fromPage; page < fromPage + pages; page++) {
      const offset = page * pageSize;
      const query = `SELECT DISTINCT ?player WHERE {
        ?player p:P54 ?stmt.
        ?stmt ps:P54 wd:${club.id}.
        ?stmt wikibase:rank ?rank.
        FILTER(?rank != wikibase:DeprecatedRank)
      } LIMIT ${pageSize} OFFSET ${offset}`;
      const label = `heavy [${i + 1}/${heavy.length}] ${club.name} p${page + 1}`;
      let data: WdResponse;
      try {
        data = await sparql<WdResponse>(query, label);
      } catch (e) {
        console.warn(`    ! ${label} skipped: ${(e as Error).message.slice(0, 60)}`);
        continue;
      }
      let pageRows = 0;
      for (const b of data.results.bindings) {
        if (!b.player) continue;
        pageRows++;
        const pid = qid(b.player.value);
        // Append to existing player if we already have them (adds this club).
        const existingP = existingByPid.get(pid);
        if (existingP) {
          if (!existingP.clubIds.includes(club.id)) existingP.clubIds.push(club.id);
          continue;
        }
        const set = newPlayerClubs.get(pid);
        if (set) set.add(club.id);
        else newPlayerClubs.set(pid, new Set([club.id]));
      }
      if (pageRows < pageSize) break;
      await sleep(200);
    }
    if ((i + 1) % 5 === 0 || i === heavy.length - 1) {
      console.log(`    → heavy ${i + 1}/${heavy.length}, new players so far: ${newPlayerClubs.size}`);
    }
    await sleep(200);
  }

  // Fetch metadata for the new player IDs.
  const newPids = [...newPlayerClubs.keys()];
  console.log(`  supplement metadata: ${newPids.length} new player ids to resolve`);
  const metaBatchSize = 100;
  const resolved: Player[] = [];
  for (let i = 0; i < newPids.length; i += metaBatchSize) {
    const batch = newPids.slice(i, i + metaBatchSize);
    const values = batch.map((p) => `wd:${p}`).join(" ");
    const query = `
      SELECT ?player ?playerEn ?natCode WHERE {
        VALUES ?player { ${values} }
        ?player wdt:P27 ?nationality.
        ?nationality wdt:P297 ?natCode.
        ?player rdfs:label ?playerEn.
        FILTER(LANG(?playerEn) = "en")
      }
    `;
    let data: WdResponse;
    try {
      data = await sparql<WdResponse>(query, `sup-meta ${i + 1}-${Math.min(i + metaBatchSize, newPids.length)}`);
    } catch (e) {
      console.warn(`    ! sup-meta skipped: ${(e as Error).message.slice(0, 60)}`);
      continue;
    }
    const seen = new Set<string>();
    for (const b of data.results.bindings) {
      if (!b.player || !b.playerEn || !b.natCode) continue;
      const pid = qid(b.player.value);
      if (seen.has(pid)) continue;
      seen.add(pid);
      const clubIds = [...(newPlayerClubs.get(pid) ?? [])];
      if (clubIds.length === 0) continue;
      resolved.push({
        id: pid,
        name: b.playerEn.value,
        nationalityCode: b.natCode.value.toUpperCase(),
        clubIds,
      });
    }
    await sleep(300);
  }
  console.log(`  supplement resolved: ${resolved.length}/${newPids.length}`);

  // Merge: existing (already mutated in-place with new clubIds) + new resolved.
  const merged = [...existing, ...resolved];
  return merged;
}

async function main() {
  const outDir = path.resolve(process.cwd(), "public/data");
  await fs.mkdir(outDir, { recursive: true });

  const clubsPath = path.join(outDir, "clubs.json");
  const leaguesPath = path.join(outDir, "leagues.json");
  const playersPath = path.join(outDir, "players.json");
  const countriesPath = path.join(outDir, "countries.json");
  let leagues: League[];
  let clubs: Club[];
  let players: Player[];

  const argHas = (flag: string) => process.argv.includes(flag);
  const cacheAll = argHas("--cache");
  const cacheClubs = cacheAll || argHas("--cache-clubs");
  const cachePlayers = cacheAll || argHas("--cache-players");
  const supplement = argHas("--supplement");

  if (cacheClubs && (await fileExists(clubsPath)) && (await fileExists(leaguesPath))) {
    console.log("→ Using cached clubs+leagues");
    leagues = JSON.parse(await fs.readFile(leaguesPath, "utf8"));
    clubs = JSON.parse(await fs.readFile(clubsPath, "utf8"));
    console.log(`  cached: ${leagues.length} leagues, ${clubs.length} clubs`);
  } else {
    console.log("→ Fetching leagues & clubs…");
    ({ leagues, clubs } = await fetchLeaguesAndClubs());

    // Apply manual logo overrides for clubs whose Wikidata P154/P41 fields
    // have been vandalized or point to non-logo images.
    try {
      const overridesRaw = await fs.readFile(
        path.resolve(process.cwd(), "scripts/logo-overrides.json"),
        "utf8",
      );
      const overrides = JSON.parse(overridesRaw) as Record<string, string>;
      let applied = 0;
      for (const c of clubs) {
        if (typeof overrides[c.id] === "string") {
          c.logoUrl = overrides[c.id];
          applied++;
        }
      }
      if (applied) console.log(`  applied ${applied} manual logo override(s)`);
    } catch {
      /* overrides file missing — fine */
    }

    await fs.writeFile(leaguesPath, JSON.stringify(leagues, null, 2));
    await fs.writeFile(clubsPath, JSON.stringify(clubs, null, 2));
  }

  if (cachePlayers && (await fileExists(playersPath))) {
    console.log("→ Using cached players");
    players = JSON.parse(await fs.readFile(playersPath, "utf8"));
    console.log(`  cached: ${players.length} players`);
    if (supplement) {
      console.log("→ Supplementing heavy clubs with extra page (OFFSET 400)…");
      players = await fetchExtraPagesForHeavyClubs(clubs, players);
    }
  } else {
    console.log("→ Fetching players (batched)…");
    players = await fetchPlayers(clubs);
  }

  // Filter players to keep only those with clubs strictly in our pool.
  // (Already ensured by the query since P54 was filtered to pool clubs.)
  // Sort clubIds for stability.
  for (const p of players) p.clubIds.sort();

  const countryCodes = new Set<string>();
  for (const c of clubs) countryCodes.add(c.countryCode);
  for (const p of players) countryCodes.add(p.nationalityCode);

  console.log("→ Fetching country metadata (flags + labels)…");
  const countries = await fetchCountries(countryCodes);

  // Drop clubs/players whose country isn't resolvable (rare — but keeps consumer code simple).
  const resolvedCodes = new Set(countries.map((c) => c.code));
  const filteredClubs = clubs.filter((c) => resolvedCodes.has(c.countryCode));
  const filteredPlayers = players
    .filter((p) => resolvedCodes.has(p.nationalityCode))
    .map((p) => ({
      ...p,
      clubIds: p.clubIds.filter((id) => filteredClubs.some((c) => c.id === id)),
    }))
    .filter((p) => p.clubIds.length > 0);

  const dataset: Dataset = {
    countries: countries.sort((a, b) => a.code.localeCompare(b.code)),
    leagues: leagues.sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    clubs: filteredClubs.sort((a, b) => a.name.localeCompare(b.name)),
    players: filteredPlayers.sort((a, b) => a.name.localeCompare(b.name)),
  };

  await fs.writeFile(
    path.join(outDir, "countries.json"),
    JSON.stringify(dataset.countries, null, 2),
  );
  await fs.writeFile(path.join(outDir, "leagues.json"), JSON.stringify(dataset.leagues, null, 2));
  await fs.writeFile(path.join(outDir, "clubs.json"), JSON.stringify(dataset.clubs, null, 2));
  await fs.writeFile(path.join(outDir, "players.json"), JSON.stringify(dataset.players, null, 2));

  console.log("\n✔ Dataset written to public/data/");
  console.log(`  countries: ${dataset.countries.length}`);
  console.log(`  leagues:   ${dataset.leagues.length}`);
  console.log(`  clubs:     ${dataset.clubs.length}`);
  console.log(`  players:   ${dataset.players.length}`);

  // Sanity check: Messi (Q615) should have Barcelona + Inter Miami + PSG.
  const messi = dataset.players.find((p) => p.id === "Q615");
  if (messi) {
    const clubNames = messi.clubIds.map((id) => dataset.clubs.find((c) => c.id === id)?.name).join(", ");
    console.log(`\n  sanity: Messi's clubs → ${clubNames || "(none in pool)"}`);
  } else {
    console.warn("\n  ! sanity check: Messi (Q615) not in dataset — data may be too narrow");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
