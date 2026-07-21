import type { Dataset } from "./types";

let cached: Dataset | null = null;

export async function loadDataset(): Promise<Dataset> {
  if (cached) return cached;
  const [countries, leagues, clubs, players] = await Promise.all([
    fetch("/data/countries.json").then((r) => r.json()),
    fetch("/data/leagues.json").then((r) => r.json()),
    fetch("/data/clubs.json").then((r) => r.json()),
    fetch("/data/players.json").then((r) => r.json()),
  ]);
  cached = { countries, leagues, clubs, players };
  return cached;
}
