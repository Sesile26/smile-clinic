/**
 * One-off icon generator for the SmileClinic PWA.
 *
 * Renders four PNGs from an inline SVG:
 *   - public/icons/icon-192.png       (purpose: any)
 *   - public/icons/icon-512.png       (purpose: any)
 *   - public/icons/icon-maskable-192.png (purpose: maskable, with safe zone)
 *   - public/icons/icon-maskable-512.png (purpose: maskable, with safe zone)
 *
 * Re-run with:  node scripts/generate-icons.mjs
 *
 * The maskable variant places the glyph inside a smaller "safe zone"
 * (80% of canvas, per the maskable-icon spec) so adaptive launchers on
 * Android can crop the corners into circles/squares without clipping the
 * brand mark.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "icons");

const NAVY = "#0A1628";
const MINT = "#00C9A7";

/** SVG for the regular (`any`) icon — fills the entire canvas. */
function svgAny() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${NAVY}"/>
  <circle cx="380" cy="132" r="36" fill="${MINT}"/>
  <path d="M256 80c70 0 130 32 130 104 0 48-12 72-22 108-10 36-18 72-28 120-8 40-20 68-40 68-24 0-30-32-40-72-6-32-12-52-40-52s-34 20-40 52c-10 40-16 72-40 72-20 0-32-28-40-68-10-48-18-84-28-120-10-36-22-60-22-108 0-72 60-104 130-104 28 0 50 6 80 16 30-10 52-16 80-16Z"
        fill="#FFFFFF"/>
</svg>`.trim();
}

/** SVG for the maskable icon — safe zone = 80% (centred, navy outside). */
function svgMaskable() {
  // The 80% safe zone is 410x410 centred. Glyph + dot live inside that box
  // so Android can crop the outer ring (e.g. into a circle) freely.
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${NAVY}"/>
  <g transform="translate(51 51) scale(0.8)">
    <circle cx="380" cy="132" r="36" fill="${MINT}"/>
    <path d="M256 80c70 0 130 32 130 104 0 48-12 72-22 108-10 36-18 72-28 120-8 40-20 68-40 68-24 0-30-32-40-72-6-32-12-52-40-52s-34 20-40 52c-10 40-16 72-40 72-20 0-32-28-40-68-10-48-18-84-28-120-10-36-22-60-22-108 0-72 60-104 130-104 28 0 50 6 80 16 30-10 52-16 80-16Z"
          fill="#FFFFFF"/>
  </g>
</svg>`.trim();
}

async function emit(svg, filename, size) {
  const out = join(OUT_DIR, filename);
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ ${filename}  (${size}×${size})`);
}

await mkdir(OUT_DIR, { recursive: true });
await Promise.all([
  emit(svgAny(), "icon-192.png", 192),
  emit(svgAny(), "icon-512.png", 512),
  emit(svgMaskable(), "icon-maskable-192.png", 192),
  emit(svgMaskable(), "icon-maskable-512.png", 512),
]);

console.log(`\nWrote 4 icons to ${OUT_DIR}`);
