/**
 * Computes each club's "arena" ring color from its existing logo image and
 * writes it into public/data/clubs.json as a new `color` field. Run after
 * refetch-logos in the fetch pipeline (needs a valid logoUrl to sample from).
 *
 * Downloads each logo, flattens it onto the medallion badge's own background
 * (so a transparent-PNG crest's edges average toward that, not black), takes
 * a 1×1 resize as a fast average color, then clamps it into a legible ring
 * band (see color-extract.ts). A club whose logo can't be fetched or decoded
 * keeps `color` unset — LogoTile falls back to a neutral arena accent for it.
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Club } from "@321guess/core";
import { clampForRing } from "./color-extract";

const UA = "321guess-color-extract/0.1 (https://github.com/munurcoskun/321guess)";
// arena-card — the medallion badge's own background.
const MEDALLION_BACKGROUND = { r: 247, g: 245, b: 240 };

async function extractColorForLogo(logoUrl: string): Promise<string | null> {
  const res = await fetch(logoUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const { data } = await sharp(buffer)
    .flatten({ background: MEDALLION_BACKGROUND })
    .resize(1, 1, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return clampForRing({ r: data[0], g: data[1], b: data[2] });
}

async function main() {
  const clubsPath = path.resolve(process.cwd(), "public/data/clubs.json");
  const clubs = JSON.parse(await fs.readFile(clubsPath, "utf8")) as Club[];

  console.log(`Extracting ring colors for ${clubs.length} clubs…`);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < clubs.length; i++) {
    const c = clubs[i];
    try {
      const color = await extractColorForLogo(c.logoUrl);
      if (color) {
        c.color = color;
        updated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if ((i + 1) % 20 === 0 || i === clubs.length - 1) {
      console.log(`  ${i + 1}/${clubs.length}  updated:${updated}  failed:${failed}`);
    }
  }

  await fs.writeFile(clubsPath, JSON.stringify(clubs, null, 2));
  console.log(`\n✔ Wrote colors for ${updated} clubs; ${failed} left without a color`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
