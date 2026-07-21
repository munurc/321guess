/**
 * Reads existing public/data/clubs.json and enriches each club with a
 * `popularity` field (Wikidata sitelink count — a good proxy for fame).
 *
 * Fast, single-query pass over all clubs. Idempotent.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Club } from "../lib/types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "321guess-popularity/0.1 (https://github.com/munurcoskun/321guess; player-guessing-game)";

async function sparql(query: string): Promise<{ results: { bindings: Array<Record<string, { value: string }>> } }> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "query=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as any;
}

async function main() {
  const clubsPath = path.resolve(process.cwd(), "public/data/clubs.json");
  const clubs = JSON.parse(await fs.readFile(clubsPath, "utf8")) as Club[];
  console.log(`Enriching ${clubs.length} clubs with popularity (sitelinks)…`);

  // Batch by 50 to stay under WQS limits.
  const batchSize = 50;
  const popularityById = new Map<string, number>();
  for (let i = 0; i < clubs.length; i += batchSize) {
    const batch = clubs.slice(i, i + batchSize);
    const values = batch.map((c) => `wd:${c.id}`).join(" ");
    const query = `SELECT ?club ?n WHERE { VALUES ?club { ${values} } ?club wikibase:sitelinks ?n. }`;
    const data = await sparql(query);
    for (const b of data.results.bindings) {
      const id = b.club.value.replace("http://www.wikidata.org/entity/", "");
      popularityById.set(id, Number(b.n.value));
    }
    console.log(`  ${Math.min(i + batchSize, clubs.length)}/${clubs.length}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const enriched: Club[] = clubs.map((c) => ({
    ...c,
    popularity: popularityById.get(c.id) ?? 0,
  }));
  await fs.writeFile(clubsPath, JSON.stringify(enriched, null, 2));
  console.log(`✔ Wrote popularity for ${enriched.filter((c) => c.popularity > 0).length}/${enriched.length} clubs`);

  // Show top and bottom for a sanity check.
  const sorted = [...enriched].sort((a, b) => b.popularity - a.popularity);
  console.log("\nTop 10 most popular:");
  for (const c of sorted.slice(0, 10)) console.log(`  ${c.popularity.toString().padStart(4)}  ${c.name}`);
  console.log("\nBottom 10 least popular:");
  for (const c of sorted.slice(-10)) console.log(`  ${c.popularity.toString().padStart(4)}  ${c.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
