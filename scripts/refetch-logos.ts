/**
 * Refetches each club's logo via the English Wikipedia REST API's page summary
 * `originalimage.source`. For football club pages this is almost always the
 * infobox crest — much more reliable than Wikidata's P154/P41 which often gets
 * vandalized to stadium photos or hand-drawn colour palettes.
 *
 * Pipeline per club:
 *   1. Wikidata sitelinks → English Wikipedia article title
 *   2. GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *   3. Take `originalimage.source` (or `thumbnail.source` fallback)
 *
 * If the API call fails, we keep the existing Wikidata logoUrl.
 * scripts/logo-overrides.json still wins over everything at the end.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Club } from "../lib/types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIPEDIA_API = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const UA = "321guess-logo-refresh/0.1 (https://github.com/munurcoskun/321guess)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchEnTitle(qid: string): Promise<string | null> {
  const query = `
    SELECT ?title WHERE {
      wd:${qid} ^schema:about ?article.
      ?article schema:isPartOf <https://en.wikipedia.org/>.
      ?article schema:name ?title.
    }
    LIMIT 1
  `;
  const res = await fetch(SPARQL_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "query=" + encodeURIComponent(query),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results: { bindings: Array<{ title?: { value: string } }> };
  };
  const t = data.results.bindings[0]?.title?.value;
  return t ?? null;
}

async function fetchImageForTitle(title: string): Promise<string | null> {
  const url = WIKIPEDIA_API + encodeURIComponent(title.replace(/ /g, "_"));
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    originalimage?: { source: string };
    thumbnail?: { source: string };
  };
  return data.originalimage?.source ?? data.thumbnail?.source ?? null;
}

async function main() {
  const clubsPath = path.resolve(process.cwd(), "public/data/clubs.json");
  const overridesPath = path.resolve(process.cwd(), "scripts/logo-overrides.json");
  const clubs = JSON.parse(await fs.readFile(clubsPath, "utf8")) as Club[];
  const overrides = JSON.parse(await fs.readFile(overridesPath, "utf8")) as Record<string, string>;

  console.log(`Refetching logos for ${clubs.length} clubs from Wikipedia REST API…`);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    if (overrides[c.id]) {
      // Manual override wins; skip API calls.
      c.logoUrl = overrides[c.id];
      continue;
    }
    try {
      const title = await fetchEnTitle(c.id);
      if (!title) {
        failed++;
        continue;
      }
      await sleep(200);
      const img = await fetchImageForTitle(title);
      if (img) {
        c.logoUrl = img;
        updated++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
    if ((i + 1) % 20 === 0 || i === clubs.length - 1) {
      console.log(`  ${i + 1}/${clubs.length}  updated:${updated}  failed:${failed}`);
    }
    await sleep(300);
  }

  await fs.writeFile(clubsPath, JSON.stringify(clubs, null, 2));
  console.log(`\n✔ Wrote ${updated} refreshed logos; ${failed} kept Wikidata fallback`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
