/**
 * Non-destructive merge of two players.json files.
 * Union of player IDs — never drops a player that appeared in a previous run.
 * For players in both, keeps the newer name/nationality but unions clubIds.
 * ClubIds are filtered to the current clubs.json set (drops stale references).
 *
 * Usage:
 *   tsx scripts/merge-players.ts <old.json> <new.json> <out.json>
 */

import fs from "node:fs/promises";
import type { Player, Club } from "../lib/types";

async function main() {
  const [oldPath, newPath, outPath] = process.argv.slice(2);
  if (!oldPath || !newPath || !outPath) {
    console.error("usage: tsx scripts/merge-players.ts <old.json> <new.json> <out.json>");
    process.exit(2);
  }

  const oldPlayers: Player[] = JSON.parse(await fs.readFile(oldPath, "utf8"));
  const newPlayers: Player[] = JSON.parse(await fs.readFile(newPath, "utf8"));
  const clubs: Club[] = JSON.parse(await fs.readFile("public/data/clubs.json", "utf8"));
  const validClubIds = new Set(clubs.map((c) => c.id));

  const byId = new Map<string, Player>();
  // Seed with old players first, then overwrite name/nat from new (fresher labels).
  for (const p of oldPlayers) byId.set(p.id, { ...p, clubIds: [...p.clubIds] });
  for (const p of newPlayers) {
    const existing = byId.get(p.id);
    if (existing) {
      // Union clubIds; take fresher metadata from new.
      const union = new Set([...existing.clubIds, ...p.clubIds]);
      byId.set(p.id, { ...p, clubIds: [...union] });
    } else {
      byId.set(p.id, { ...p, clubIds: [...p.clubIds] });
    }
  }

  // Drop clubIds that no longer exist in clubs.json; drop players with no clubs.
  const merged: Player[] = [];
  let stalePairs = 0;
  let droppedPlayers = 0;
  for (const p of byId.values()) {
    const kept = p.clubIds.filter((id) => validClubIds.has(id));
    stalePairs += p.clubIds.length - kept.length;
    if (kept.length === 0) {
      droppedPlayers++;
      continue;
    }
    kept.sort();
    merged.push({ ...p, clubIds: kept });
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));

  await fs.writeFile(outPath, JSON.stringify(merged, null, 2));

  const oldIds = new Set(oldPlayers.map((p) => p.id));
  const newIds = new Set(newPlayers.map((p) => p.id));
  console.log(`old:               ${oldPlayers.length}`);
  console.log(`new:               ${newPlayers.length}`);
  console.log(`only in old:       ${[...oldIds].filter((i) => !newIds.has(i)).length}`);
  console.log(`only in new:       ${[...newIds].filter((i) => !oldIds.has(i)).length}`);
  console.log(`merged (union):    ${merged.length}`);
  console.log(`stale clubId refs: ${stalePairs}`);
  console.log(`dropped (no club): ${droppedPlayers}`);
  console.log(`→ wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
