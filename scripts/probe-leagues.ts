/**
 * Probe Wikidata for the correct Q IDs of our target leagues.
 * Uses the wbsearchentities API + a follow-up SPARQL check that the entity
 * is indeed a football league (has clubs via P118).
 */

const UA = "321guess-league-probe/0.1 (https://github.com/munurcoskun/321guess)";

const queries = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Süper Lig",
  "Eredivisie",
  "Primeira Liga",
  "Belgian Pro League",
  "Scottish Premiership",
  "Campeonato Brasileiro Série A",
  "Argentine Primera División",
  "Major League Soccer",
  "Liga MX",
  "Saudi Pro League",
];

async function search(term: string) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    term,
  )}&language=en&format=json&limit=10&type=item&origin=*`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return (await res.json()) as { search: Array<{ id: string; label: string; description?: string }> };
}

async function countClubsWithLeague(qid: string): Promise<number> {
  const q = `SELECT (COUNT(DISTINCT ?club) AS ?n) WHERE { ?club wdt:P118 wd:${qid}. }`;
  const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { results: { bindings: Array<{ n: { value: string } }> } };
  return Number(data.results.bindings[0]?.n.value ?? "0");
}

async function main() {
  for (const term of queries) {
    const { search: hits } = await search(term);
    let picked: { id: string; label: string; n: number } | null = null;
    for (const hit of hits.slice(0, 5)) {
      const n = await countClubsWithLeague(hit.id);
      if (n > 5) {
        if (!picked || n > picked.n) picked = { id: hit.id, label: hit.label, n };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (picked) {
      console.log(`  ${term.padEnd(35)} → ${picked.id.padEnd(10)} (${picked.n} clubs)  [${picked.label}]`);
    } else {
      console.log(`  ${term.padEnd(35)} → ?? no candidate with clubs`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
