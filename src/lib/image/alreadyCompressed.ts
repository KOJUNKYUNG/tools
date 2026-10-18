/**
 * Signs that an image was already compressed, read from its bytes without
 * decoding it. ppt-compress's size estimate uses them so that re-running a
 * deck it already compressed does not promise the full saving again (#78).
 */

/** The IJG (JPEG Annex K) base luminance and chrominance tables. */
const IJG_BASE = {
  luma: [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
    92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
  ],
  chroma: [
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
    47, 66, 99, 99, 99, 99, 99, 99, ...Array<number>(32).fill(99),
  ],
};

/**
 * The table libjpeg writes at `quality` (1–100), baseline-clamped to 1–255,
 * as browsers' canvas encoders do.
 */
export function ijgTable(kind: keyof typeof IJG_BASE, quality: number): number[] {
  const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return IJG_BASE[kind].map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Each quality's table sums, luma alone and luma + chroma, for 1–100. */
const IJG_SUMS = Array.from({ length: 100 }, (_, i) => {
  const luma = sum(ijgTable("luma", i + 1));
  return { quality: i + 1, luma, lumaPlusChroma: luma + sum(ijgTable("chroma", i + 1)) };
});

/** The quantization tables (id → 64 values) defined before the first scan. */
function readQuantTables(bytes: Uint8Array): Map<number, number[]> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const tables = new Map<number, number[]>();
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      at += 2; // standalone marker, no length
      continue;
    }
    if (marker === 0xda || at + 4 > bytes.length) break; // start of scan
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length) return null;
    if (marker === 0xdb) {
      // DQT: one or more tables, each Pq/Tq then 64 values of 1 or 2 bytes.
      for (let p = at + 4; p < end; ) {
        const wide = bytes[p] >> 4 === 1;
        const id = bytes[p] & 0x0f;
        const size = wide ? 128 : 64;
        if (p + 1 + size > end) return null;
        const values = Array.from({ length: 64 }, (_, i) =>
          wide ? (bytes[p + 1 + 2 * i] << 8) | bytes[p + 2 + 2 * i] : bytes[p + 1 + i],
        );
        tables.set(id, values);
        p += 1 + size;
      }
    }
    at = end;
  }
  return tables;
}

/**
 * The quality (1–100) a JPEG was most likely saved at, ImageMagick-style:
 * its quantization tables' sum is matched to the nearest IJG quality's sum.
 * Encoders with their own tables (cameras, Photoshop) map to the IJG quality
 * that quantizes about as coarsely. Null when no table can be read.
 */
export function estimateJpegQuality(bytes: Uint8Array): number | null {
  const tables = readQuantTables(bytes);
  const luma = tables?.get(0);
  if (!tables || !luma) return null;
  const chroma = tables.get(1);
  const target = sum(luma) + (chroma ? sum(chroma) : 0);
  let best = 1;
  let bestGap = Infinity;
  for (const sums of IJG_SUMS) {
    const gap = Math.abs((chroma ? sums.lumaPlusChroma : sums.luma) - target);
    // Sums fall as quality rises; on a tie keep the higher quality.
    if (gap <= bestGap) {
      best = sums.quality;
      bestGap = gap;
    }
  }
  return best;
}

/** Whether a PNG is indexed (IHDR colour type 3): its colours are already reduced. */
export function isPalettePng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 26 || signature.some((b, i) => bytes[i] !== b)) return false;
  const ihdr = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  return ihdr === "IHDR" && bytes[25] === 3;
}

/**
 * How many distinct RGBA values `pixels` holds, counting no further than one
 * past `cap`: past the cap the exact number does not matter, and a photo
 * gets there within its first rows.
 */
export function countColors(pixels: Uint8ClampedArray, cap: number): number {
  const words = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength >> 2);
  const seen = new Set<number>();
  for (let i = 0; i < words.length && seen.size <= cap; i++) seen.add(words[i]);
  return seen.size;
}
