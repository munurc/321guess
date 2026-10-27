import type { Dataset } from "./types";

// The in-flight promise is cached (not just the result) so concurrent callers
// — e.g. the native splash overlay and the Setup screen on launch — share one
// ~10MB download instead of each starting their own.
let cached: Promise<Dataset> | null = null;

/**
 * Loads the four dataset JSON files from `${baseUrl}/data/*.json`. Takes an
 * explicit base URL (rather than a same-origin relative fetch) because
 * React Native has no "current page" to resolve a relative URL against —
 * every caller (web or native) passes the same apps/api origin.
 */
export function loadDataset(baseUrl: string): Promise<Dataset> {
  if (cached) return cached;
  cached = Promise.all(
    ["countries", "leagues", "clubs", "players"].map((name) =>
      fetch(`${baseUrl}/data/${name}.json`).then((r) => r.json()),
    ),
  ).then(([countries, leagues, clubs, players]) => ({ countries, leagues, clubs, players }));
  // Don't pin a failed fetch: let the next caller retry.
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
