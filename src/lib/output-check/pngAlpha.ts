/**
 * Whether a PNG actually uses transparency: some pixel is less than fully
 * opaque, through an alpha channel or a tRNS chunk. Reads the bytes itself
 * (no canvas), so image checks run in Node as in the browser, and written
 * independently of the browser preparer's canvas scan, so the two cannot
 * share a bug.
 *
 * The pixel data is inflated as a stream and unfiltered one row at a time,
 * so a large picture never needs a whole-image buffer, and the scan stops at
 * the first transparent pixel.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/** Adam7: x start, y start, x step, y step of each pass. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

interface Png {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
  trns: Uint8Array | null;
  idat: Uint8Array[];
}

function readChunks(bytes: Uint8Array): Png | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (type(12) !== "IHDR") return null;
  const png: Png = {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlaced: bytes[28] === 1,
    trns: null,
    idat: [],
  };
  if (!DEPTHS[png.colorType]?.includes(png.bitDepth) || png.width === 0 || png.height === 0) {
    return null;
  }
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const name = type(at + 4);
    const data = at + 8;
    if (data + length > bytes.length) return null;
    if (name === "tRNS") png.trns = bytes.subarray(data, data + length);
    else if (name === "IDAT") png.idat.push(bytes.subarray(data, data + length));
    else if (name === "IEND") return png;
    at = data + length + 4;
  }
  return null;
}

/**
 * The test for one unfiltered row of `count` pixels: true when one of them is
 * not fully opaque. Null when no pixel of this PNG can be transparent.
 */
function transparencyTest(png: Png): ((row: Uint8Array, count: number) => boolean) | null {
  const { bitDepth, colorType, trns } = png;
  const max = (1 << bitDepth) - 1;
  const sample16 = (row: Uint8Array, i: number) => (row[i] << 8) | row[i + 1];

  if (colorType === 4 || colorType === 6) {
    const channels = CHANNELS[colorType];
    if (bitDepth === 8) {
      return (row, count) => {
        for (let i = channels - 1; i < count * channels; i += channels) if (row[i] !== 255) return true;
        return false;
      };
    }
    return (row, count) => {
      for (let i = (channels - 1) * 2; i < count * channels * 2; i += channels * 2) {
        if (sample16(row, i) !== 0xffff) return true;
      }
      return false;
    };
  }
  if (!trns) return null;

  /** The k-th sample of a row of 1-, 2-, 4- or 8-bit samples. */
  const packed = (row: Uint8Array, k: number) => {
    const bit = k * bitDepth;
    return (row[bit >> 3] >> (8 - bitDepth - (bit & 7))) & max;
  };

  if (colorType === 3) {
    if (trns.every((a) => a === 255)) return null;
    return (row, count) => {
      for (let k = 0; k < count; k++) {
        const index = packed(row, k);
        if (index < trns.length && trns[index] !== 255) return true;
      }
      return false;
    };
  }
  if (trns.length < (colorType === 0 ? 2 : 6)) return null;
  const key = Array.from({ length: CHANNELS[colorType] }, (_, c) => sample16(trns, c * 2));
  if (colorType === 0) {
    const grey = key[0];
    return (row, count) => {
      for (let k = 0; k < count; k++) {
        if ((bitDepth === 16 ? sample16(row, k * 2) : packed(row, k)) === grey) return true;
      }
      return false;
    };
  }
  return (row, count) => {
    for (let k = 0; k < count; k++) {
      const at = k * 3 * (bitDepth >> 3);
      const rgb =
        bitDepth === 16
          ? [sample16(row, at), sample16(row, at + 2), sample16(row, at + 4)]
          : [row[at], row[at + 1], row[at + 2]];
      if (rgb[0] === key[0] && rgb[1] === key[1] && rgb[2] === key[2]) return true;
    }
    return false;
  };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reverse a row's filter in place, given the previous row of its pass. */
function unfilter(filter: number, row: Uint8Array, prior: Uint8Array, bpp: number): boolean {
  const n = row.length;
  switch (filter) {
    case 0:
      return true;
    case 1:
      for (let i = bpp; i < n; i++) row[i] = (row[i] + row[i - bpp]) & 0xff;
      return true;
    case 2:
      for (let i = 0; i < n; i++) row[i] = (row[i] + prior[i]) & 0xff;
      return true;
    case 3:
      for (let i = 0; i < n; i++) {
        row[i] = (row[i] + (((i >= bpp ? row[i - bpp] : 0) + prior[i]) >> 1)) & 0xff;
      }
      return true;
    case 4:
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const c = i >= bpp ? prior[i - bpp] : 0;
        row[i] = (row[i] + paeth(a, prior[i], c)) & 0xff;
      }
      return true;
    default:
      return false;
  }
}

/**
 * True when some pixel of the PNG is less than fully opaque, false when none
 * is, null when the bytes are not a PNG this can read to the end (not a PNG,
 * truncated, or corrupt).
 */
export async function pngAlphaUsed(bytes: Uint8Array): Promise<boolean | null> {
  const png = readChunks(bytes);
  if (!png) return null;
  const test = transparencyTest(png);
  if (!test) return false;

  const bitsPerPixel = CHANNELS[png.colorType] * png.bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  // Each pass's pixels per row and row count, skipping empty passes.
  const passes = (png.interlaced ? ADAM7 : [[0, 0, 1, 1]])
    .map(([x0, y0, dx, dy]) => [Math.ceil((png.width - x0) / dx), Math.ceil((png.height - y0) / dy)])
    .filter(([w, h]) => w > 0 && h > 0);

  // Blob copies the views' bytes; `as` because BlobPart wants ArrayBuffer-backed views.
  const stream = new Blob(png.idat as Uint8Array<ArrayBuffer>[])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();

  let pass = 0;
  let rowsLeft = passes[0][1];
  let rowLength = 1 + Math.ceil((passes[0][0] * bitsPerPixel) / 8);
  let row = new Uint8Array(rowLength);
  let prior = new Uint8Array(rowLength - 1);
  let filled = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return null; // the rows ran out before the picture did
      for (let at = 0; at < value.length; ) {
        const take = Math.min(rowLength - filled, value.length - at);
        row.set(value.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled < rowLength) break;

        const pixels = row.subarray(1);
        if (!unfilter(row[0], pixels, prior, bpp)) return null;
        if (test(pixels, passes[pass][0])) return true;
        filled = 0;
        if (--rowsLeft > 0) {
          prior.set(pixels);
          continue;
        }
        if (++pass === passes.length) return false;
        rowsLeft = passes[pass][1];
        rowLength = 1 + Math.ceil((passes[pass][0] * bitsPerPixel) / 8);
        row = new Uint8Array(rowLength);
        prior = new Uint8Array(rowLength - 1);
      }
    }
  } catch {
    return null; // the compressed data is corrupt
  } finally {
    void reader.cancel().catch(() => {});
  }
}
