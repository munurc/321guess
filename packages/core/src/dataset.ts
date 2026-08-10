import type { Dataset } from "./types";

let cached: Dataset | null = null;

/**
 * Loads the four dataset JSON files from `${baseUrl}/data/*.json`. Takes an
 * explicit base URL (rather than a same-origin relative fetch) because
 * React Native has no "current page" to resolve a relative URL against —
 * every caller (web or native) passes the same apps/api origin.
 */
export async function loadDataset(baseUrl: string): Promise<Dataset> {
  if (cached) return cached;
  const [countries, leagues, clubs, players] = await Promise.all(
    ["countries", "leagues", "clubs", "players"].map((name) =>
      fetch(`${baseUrl}/data/${name}.json`).then((r) => r.json()),
    ),
  );
  cached = { countries, leagues, clubs, players };
  return cached;
}
