// Test-only PNG encoder (never imported by the app): real, decodable PNGs of
// every colour type, bit depth and interlace. Rows cycle through all five
// filter types, so a decoder's unfiltering is exercised on each. The Adam7
// table and Paeth predictor repeat pngAlpha.ts's on purpose: an encoder
// sharing the decoder's code would share its bugs.
import { crc32, deflateSync } from "node:zlib";

export interface TestPngOptions {
  width: number;
  height: number;
  /** 0 grey, 2 RGB, 3 indexed, 4 grey + alpha, 6 RGBA. */
  colorType: 0 | 2 | 3 | 4 | 6;
  bitDepth?: 1 | 2 | 4 | 8 | 16;
  interlace?: boolean;
  /** The samples of the pixel at (x, y) in the colour type's order; a palette index for type 3. */
  pixel: (x: number, y: number) => number[];
  /** PLTE entries, for type 3. */
  palette?: [number, number, number][];
  /** tRNS: the key grey (type 0), key RGB (type 2) or one alpha per palette entry (type 3). */
  trns?: number[];
  /** Split the compressed data over this many IDAT chunks. */
  idatChunks?: number;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as const;

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

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function testPng({
  width,
  height,
  colorType,
  bitDepth = 8,
  interlace = false,
  pixel,
  palette,
  trns,
  idatChunks = 1,
}: TestPngOptions): Uint8Array {
  const channels = CHANNELS[colorType];
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];

  const filtered: number[] = [];
  let rowIndex = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rowBytes = Math.ceil((pw * bitsPerPixel) / 8);
    let prior = new Uint8Array(rowBytes);
    for (let py = 0; py < ph; py++) {
      const raw = new Uint8Array(rowBytes);
      let bit = 0;
      for (let px = 0; px < pw; px++) {
        for (const sample of pixel(x0 + px * dx, y0 + py * dy)) {
          if (bitDepth === 16) {
            raw[bit >> 3] = sample >> 8;
            raw[(bit >> 3) + 1] = sample & 0xff;
          } else {
            raw[bit >> 3] |= sample << (8 - bitDepth - (bit & 7));
          }
          bit += bitDepth;
        }
      }
      const filter = rowIndex++ % 5;
      filtered.push(filter);
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= bpp ? raw[i - bpp] : 0;
        const b = prior[i];
        const c = i >= bpp ? prior[i - bpp] : 0;
        const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
        filtered.push((raw[i] - predictor) & 0xff);
      }
      prior = raw;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([bitDepth, colorType, 0, 0, interlace ? 1 : 0], 8);

  const data = deflateSync(Uint8Array.from(filtered));
  const step = Math.ceil(data.length / idatChunks);
  const idat: Buffer[] = [];
  for (let at = 0; at < data.length; at += step) idat.push(chunk("IDAT", data.subarray(at, at + step)));

  const trnsBytes = (): Uint8Array => {
    if (!trns) return new Uint8Array(0);
    if (colorType === 3) return Uint8Array.from(trns);
    const out = Buffer.alloc(trns.length * 2);
    trns.forEach((v, i) => out.writeUInt16BE(v, i * 2));
    return out;
  };

  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      ...(palette ? [chunk("PLTE", Uint8Array.from(palette.flat()))] : []),
      ...(trns ? [chunk("tRNS", trnsBytes())] : []),
      ...idat,
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}
