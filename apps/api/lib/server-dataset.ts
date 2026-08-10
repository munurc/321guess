import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Dataset } from "./types";

let cached: Dataset | null = null;

/** Server-side counterpart to loadDataset() in lib/data.ts — reads the same
 * public/data/*.json files straight off disk instead of over HTTP, since
 * relative fetch() URLs don't resolve inside API routes. */
export async function loadServerDataset(): Promise<Dataset> {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "public", "data");
  const [countries, leagues, clubs, players] = await Promise.all(
    ["countries.json", "leagues.json", "clubs.json", "players.json"].map((file) =>
      readFile(path.join(dir, file), "utf8").then((raw) => JSON.parse(raw)),
    ),
  );
  cached = { countries, leagues, clubs, players } as Dataset;
  return cached;
}
