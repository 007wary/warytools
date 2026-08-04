// Regenerates the favicon/app-icon set from the "WT" mark.
//
// Run with `node scripts/generate-icons.mjs` after changing the mark below.
// This is NOT part of any npm lifecycle hook — the outputs are committed, so
// it only needs re-running when the icon design itself changes.
//
// sharp is present transitively via Next's image optimizer; it is not a
// declared dependency, which is fine for a manually-invoked script but means
// this should not be wired into postinstall.
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same mark as src/app/icon.svg: #2563eb rounded square, white "WT".
// Letterforms are paths, not <text>, so rendering never depends on a font
// being installed (Linux and some Android WebViews have no Arial).
// Geometry note: the glyphs are deliberately heavy and widely spaced. A
// lighter "W" loses its middle vertex at 16x16 — the three strokes and two
// valleys collapse into a blur once the letter is only ~6px wide. Strokes are
// ~5 units on a 64 unit box so every stem survives one pixel at that size.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2563eb"/>
  <g fill="#ffffff">
    <path d="M4 20 h7.4 l2.9 13.2 3.5-13.2 h5.6 l3.5 13.2 2.9-13.2 h7.4 l-6.6 24 h-7 l-3-11.6 -3 11.6 h-7 z"/>
    <path d="M38 20 h22 v6.4 h-8 v17.6 h-6.4 v-17.6 h-7.6 z"/>
  </g>
</svg>`;

// Apple strips transparency and composites on black, so the touch icon gets an
// opaque square with no rounding — iOS applies its own mask.
const APPLE_MARK = MARK.replace('rx="14" fill="#2563eb"', 'fill="#2563eb"');

// Maskable variant: Android crops to its own shape (often a circle), so all
// content must sit inside the central 80% "safe zone". The base mark only has
// a 6.3% margin, which the circular crop would clip — so scale the glyphs to
// 72% and centre them on a full-bleed field.
const MASKABLE_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#2563eb"/>
  <g fill="#ffffff" transform="translate(32 32) scale(0.72) translate(-32 -32)">
    ${MARK.match(/<path[^>]*\/>/g).join("\n    ")}
  </g>
</svg>`;

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Minimal ICO writer: 6-byte header, 16-byte directory entry per image, then
// the PNG payloads. PNG-in-ICO is supported everywhere that matters (Vista+).
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const out = [];

// src/app/icon.svg — Next.js file convention, served as the primary icon to
// modern browsers at /icon.svg.
out.push([join(root, "src/app/icon.svg"), Buffer.from(MARK + "\n")]);

// src/app/favicon.ico — Next.js serves this at /favicon.ico, the path Google's
// SERP crawler, older Safari, and most link-preview scrapers look for.
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({ size, data: await png(MARK, size) })),
);
out.push([join(root, "src/app/favicon.ico"), buildIco(icoImages)]);

// src/app/apple-icon.png — iOS home-screen icon (180x180 is the current size).
out.push([join(root, "src/app/apple-icon.png"), await png(APPLE_MARK, 180)]);

// public/icon-{192,512}.png — raster sizes the PWA install prompt requires.
for (const size of [192, 512]) {
  out.push([join(root, `public/icon-${size}.png`), await png(MARK, size)]);
}

// public/icon-maskable-512.png — padded so Android's crop can't clip the mark.
out.push([join(root, "public/icon-maskable-512.png"), await png(MASKABLE_MARK, 512)]);

for (const [path, data] of out) {
  await writeFile(path, data);
  console.log(`wrote ${path.slice(root.length + 1)} (${data.length} bytes)`);
}
