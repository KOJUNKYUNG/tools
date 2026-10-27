// Makes the gallery's files in public/gallery/ from the catalog
// (src/lib/gallery/catalog.ts), to the spec's quality bar:
//   - an original at the catalog's size (4K, or the source's own size when
//     smaller), JPEG q90 (mozjpeg; q82 visibly shifted colour)
//     or lossless PNG where the catalog says .png, sRGB, no metadata;
//   - a thumbnail: 480 × 270 JPEG q75 (at most 40 KB);
//   - public/gallery/CREDITS.md, written from the catalog's sources.
// Inputs live in scripts/gallery/sources/{category}/{name}.{png,jpg,jpeg,webp,tif,tiff}
// (gitignored: CC0 originals are re-downloadable from the URL the catalog
// records; gradients and patterns are rendered there by pnpm gallery:shaders
// from shaders.json). The three legacy gradients have no source: their
// committed JPEG is the original, so only its metadata is stripped, losslessly.
//
// Run: pnpm gallery:build [--only=id,id]
// catalog.test.ts then holds every file to the bar (sizes, bytes, metadata).

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { GALLERY_IMAGES } from "@/lib/gallery/catalog";
import { renderCredits } from "@/lib/gallery/credits";
import type { GalleryImage } from "@/lib/gallery/types";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const SOURCES = fileURLToPath(new URL("./sources/", import.meta.url));
const SOURCE_EXTS = ["png", "jpg", "jpeg", "webp", "tif", "tiff"];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const ORIGINAL = { quality: 90, mozjpeg: true } as const;
const THUMB = { width: 480, height: 270, quality: 75 } as const;

function sourceFor(img: GalleryImage): string | null {
  for (const ext of SOURCE_EXTS) {
    const p = join(SOURCES, img.category, `${img.name}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Drop a JPEG's APP1 (EXIF / XMP) and APP2 (ICC) segments without touching
 * the compressed image data, so a legacy original is not re-encoded.
 */
function stripJpegMetadata(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a JPEG");
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`bad JPEG marker at ${i}`);
    const marker = buf[i + 1];
    // Start of scan: the rest is image data.
    if (marker === 0xda) {
      parts.push(buf.subarray(i));
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker !== 0xe1 && marker !== 0xe2) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(parts);
}

async function writeThumbnail(input: string | Buffer, img: GalleryImage) {
  await open(input)
    .resize(THUMB.width, THUMB.height, { fit: "cover" })
    .jpeg({ quality: THUMB.quality, mozjpeg: true })
    .toFile(join(PUBLIC, img.thumbnailUrl));
}

/** Sources can exceed sharp's default pixel limit (a 16k × 16k texture scan). */
const open = (input: string | Buffer) => sharp(input, { limitInputPixels: false });

async function build(img: GalleryImage): Promise<string> {
  const out = join(PUBLIC, img.url);
  const source = sourceFor(img);
  if (!source) {
    if (!existsSync(out)) throw new Error(`no source in ${join(SOURCES, img.category)} and no committed original`);
    await writeFile(out, stripJpegMetadata(await readFile(out)));
    await writeThumbnail(out, img);
    return "metadata stripped (no source)";
  }
  const meta = await open(source).metadata();
  if (!meta.width || !meta.height) throw new Error("source has no pixel size");
  const [w, h] = meta.orientation && meta.orientation >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  if (w < img.width || h < img.height) {
    throw new Error(`source is ${w} × ${h}, smaller than ${img.width} × ${img.height}; never enlarged`);
  }
  // sharp converts to sRGB and drops all metadata unless told to keep it.
  const resized = open(source).rotate().resize(img.width, img.height, { fit: "cover", position: "attention" });
  const original = await (img.format === "png" ? resized.png({ compressionLevel: 9 }) : resized.jpeg(ORIGINAL)).toBuffer();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, original);
  await writeThumbnail(original, img);
  return `from ${source.slice(SOURCES.length)}`;
}

let failed = 0;
for (const img of GALLERY_IMAGES) {
  if (only && !only.includes(img.id)) continue;
  try {
    const how = await build(img);
    const kb = (await readFile(join(PUBLIC, img.url))).length / 1024;
    console.log(`${img.id.padEnd(24)} ${kb.toFixed(0).padStart(4)} KB  ${how}`);
  } catch (e) {
    failed++;
    console.error(`${img.id.padEnd(24)} FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
await writeFile(join(PUBLIC, "gallery", "CREDITS.md"), renderCredits(GALLERY_IMAGES));
console.log("wrote public/gallery/CREDITS.md");
if (failed) process.exit(1);
