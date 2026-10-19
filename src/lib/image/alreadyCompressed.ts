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

interface Segment {
  marker: number;
  /** First byte after the length field. */
  start: number;
  end: number;
}

/** The marker segments before the first scan; null when the bytes break off or are not a JPEG. */
function readSegments(bytes: Uint8Array): Segment[] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const segments: Segment[] = [];
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
    segments.push({ marker, start: at + 4, end });
    at = end;
  }
  return segments;
}

/** The quantization tables (id → 64 values) defined before the first scan. */
function readQuantTables(bytes: Uint8Array): Map<number, number[]> | null {
  const segments = readSegments(bytes);
  if (!segments) return null;
  const tables = new Map<number, number[]>();
  for (const { start, end } of segments.filter((s) => s.marker === 0xdb)) {
    // DQT: one or more tables, each Pq/Tq then 64 values of 1 or 2 bytes.
    for (let p = start; p < end; ) {
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
  return tables;
}

/**
 * Whether a colour JPEG stores its chroma at full resolution (4:4:4): every
 * component has the same sampling factors. The engine's re-encoder (Chrome's
 * canvas) always writes 4:2:0, so such a JPEG loses three quarters of its
 * chroma and shrinks further than its quality alone says. False for
 * subsampled or greyscale JPEGs, and when no frame header can be read.
 */
export function jpegKeepsFullChroma(bytes: Uint8Array): boolean {
  // SOF0–SOF15, less DHT (c4), JPG (c8) and DAC (cc), which share the range.
  const frame = readSegments(bytes)?.find(
    (s) => s.marker >= 0xc0 && s.marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(s.marker),
  );
  if (!frame) return false;
  const components = bytes[frame.start + 5];
  if (components !== 3 || frame.start + 6 + components * 3 > frame.end) return false;
  const factors = Array.from({ length: components }, (_, i) => bytes[frame.start + 7 + i * 3]);
  return factors.every((f) => f === factors[0]);
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

export interface PngHeader {
  width: number;
  height: number;
  /** IHDR colour type: 0 grey, 2 RGB, 3 indexed, 4 grey + alpha, 6 RGBA. */
  colorType: number;
}

/** A PNG's size and colour type from its IHDR chunk; null for anything else. */
export function readPngHeader(bytes: Uint8Array): PngHeader | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 26 || signature.some((b, i) => bytes[i] !== b)) return null;
  const ihdr = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdr !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), colorType: bytes[25] };
}

export interface ColorCount {
  /** Distinct RGBA values, counted no further than one past the cap. */
  colors: number;
  /** Every pixel fully opaque; only known when the count stayed within the cap. */
  opaque: boolean;
}

/**
 * How many distinct RGBA values `pixels` holds, counting no further than one
 * past `cap`: past the cap the exact number does not matter, and a photo
 * gets there within its first rows.
 */
export function countColors(pixels: Uint8ClampedArray, cap: number): ColorCount {
  const words = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength >> 2);
  const seen = new Set<number>();
  let opaque = true;
  for (let i = 0; i < words.length && seen.size <= cap; i++) {
    seen.add(words[i]);
    if (pixels[i * 4 + 3] !== 255) opaque = false;
  }
  return { colors: seen.size, opaque };
}
