import { describe, expect, it, vi, beforeEach } from "vitest";

// loadDataset caches at module scope, so each test needs a fresh module
// instance (vi.resetModules + dynamic import) — otherwise test order leaks
// the cache from one test into the next.
async function freshLoadDataset() {
  vi.resetModules();
  const mod = await import("./dataset");
  return mod.loadDataset;
}

function mockFetchJson(payload: unknown) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) });
}

describe("loadDataset", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", undefined);
  });

  it("fetches all four dataset files from the given base URL", async () => {
    const loadDataset = await freshLoadDataset();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url);
        return Promise.resolve({ json: () => Promise.resolve([]) });
      }),
    );

    await loadDataset("https://api.321guess.com");

    expect(calls.sort()).toEqual(
      [
        "https://api.321guess.com/data/clubs.json",
        "https://api.321guess.com/data/countries.json",
        "https://api.321guess.com/data/leagues.json",
        "https://api.321guess.com/data/players.json",
      ].sort(),
    );
  });

  it("caches the result — a second call does not re-fetch", async () => {
    const loadDataset = await freshLoadDataset();
    const fetchSpy = mockFetchJson([]);
    vi.stubGlobal("fetch", fetchSpy);

    await loadDataset("https://api.321guess.com");
    await loadDataset("https://api.321guess.com");

    expect(fetchSpy).toHaveBeenCalledTimes(4); // 4 files, first call only
  });
});
