// Embeds a PNG into a PDF without letting it grow (issue #178).
//
// pdf-lib's own embedPng decodes every PNG to 8-bit RGB plus alpha and
// deflates the pixels without PNG's predictors, so 13 screenshots of 6.7 MB
// came out as a 9.45 MB PDF. Its decoder (UPNG 1.0.1) also mis-reads an
// interlaced PNG whose later pass starts with an Average-filtered row. Here
// a PNG's data is inflated and checked first, then goes in one of two ways,
// both lossless:
//
// - Its own compressed data, untouched, when a PDF image can describe it: no
//   alpha channel, no colour key, not interlaced. PDF's FlateDecode takes
//   the PNG predictors as a decode parameter (ISO 32000-1 §7.4.4.4), so the
//   IDAT chunks joined are the image stream as they are. A palette PNG keeps
//   its palette (an Indexed colour space); one with transparent palette
//   entries gets a soft mask beside it.
// - Otherwise (alpha channel, colour key, interlacing) decoded here, then
//   deflated with the PNG predictors chosen row by row as PNG encoders do, or
//   without them when a trial on a few bands of rows finds that smaller
//   (flat-coloured art), the
//   colour (grey when every pixel is) and the alpha as two images, the alpha
//   as the soft mask. Samples are stored at 8 bits, as pdf-lib always stored
//   PNGs, so a 16-bit PNG with alpha or a colour key keeps its high bytes (a
//   viewer shows 8 bits a sample anyway).
//
// No PNG reaches pdf-lib's decoder, which never returns on some damaged
// image data. What a browser shows, this shows: image data that runs past
// the picture's end or fails its checksum only after every scanline, and
// data that ends cleanly but early (the missing rows left at zero), are decoded
// as they are; an animated PNG goes in as its default image. Data broken
// before the picture's end, a header PNG does not allow or a bad filter
// byte is refused as the user's damaged file. Colour profiles and gamma
// chunks are ignored, as pdf-lib ignores them.

import { type PDFDocument, type PDFRef } from "pdf-lib";
import { INVALID_INPUT_PREFIX } from "@/lib/errors";

/** A picture placed in a PDF: its object and its stored size in pixels. */
export interface EmbeddedImage {
  ref: PDFRef;
  width: number;
  height: number;
}

/** PNG's colour types (IHDR). */
const ColorType = { grey: 0, rgb: 2, indexed: 3, greyAlpha: 4, rgba: 6 } as const;
type ColorType = (typeof ColorType)[keyof typeof ColorType];

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: ColorType;
  interlaced: boolean;
}

interface PngChunks {
  header: PngHeader;
  palette: Uint8Array | null;
  /** The tRNS chunk: a colour key (grey or RGB) or an alpha per palette entry. */
  transparency: Uint8Array | null;
  /** The IDAT chunks' data joined: one zlib stream. */
  data: Uint8Array<ArrayBuffer>;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<ColorType, number> = {
  [ColorType.grey]: 1,
  [ColorType.rgb]: 3,
  [ColorType.indexed]: 1,
  [ColorType.greyAlpha]: 2,
  [ColorType.rgba]: 4,
};
// Bit depths PNG allows per colour type; PDF images take all of them.
const DEPTHS: Record<ColorType, number[]> = {
  [ColorType.grey]: [1, 2, 4, 8, 16],
  [ColorType.rgb]: [8, 16],
  [ColorType.indexed]: [1, 2, 4, 8],
  [ColorType.greyAlpha]: [8, 16],
  [ColorType.rgba]: [8, 16],
};
const isColorType = (v: number): v is ColorType => Object.values<number>(ColorType).includes(v);
/** PNG allows at most 256 palette entries, and PDF's Indexed colour space no more. */
const MAX_PALETTE_BYTES = 256 * 3;
/** Adam7: x start, y start, x step, y step of each pass; one pass covers a plain PNG. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;
const WHOLE = [[0, 0, 1, 1]] as const;

/** The chunks this embedder reads, or null for anything that is not a plain PNG it understands. */
function readChunks(bytes: Uint8Array): PngChunks | null {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: PngHeader | null = null;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idats: Uint8Array[] = [];
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    const data = bytes.subarray(at + 8, Math.min(at + 8 + length, bytes.length));
    if (end > bytes.length) {
      // The file is cut off: its image data so far is all there is.
      if (type === "IDAT") idats.push(data);
      break;
    }
    if (type === "IHDR" && length >= 13) {
      const colorType = data[9];
      // Compression and filter methods other than 0 are not PNG's.
      if (!isColorType(colorType) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) return null;
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        bitDepth: data[8],
        colorType,
        interlaced: data[12] === 1,
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    at = end;
  }
  if (!header || header.width === 0 || header.height === 0 || idats.length === 0) return null;
  if (!DEPTHS[header.colorType].includes(header.bitDepth)) return null;
  if (
    header.colorType === ColorType.indexed &&
    (!palette || palette.length === 0 || palette.length % 3 !== 0 || palette.length > MAX_PALETTE_BYTES)
  ) {
    return null;
  }
  const data = new Uint8Array(idats.reduce((sum, d) => sum + d.length, 0));
  let offset = 0;
  for (const d of idats) {
    data.set(d, offset);
    offset += d.length;
  }
  return { header, palette, transparency, data };
}

interface Pass {
  /** First pixel's column and row, and the step between pixels. */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** The pass's size in pixels, and the bytes of one of its rows (no filter byte). */
  width: number;
  height: number;
  rowBytes: number;
}

/** The passes a PNG's scanlines come in, empty ones left out. */
function passesOf({ width, height, bitDepth, colorType, interlaced }: PngHeader): Pass[] {
  const bitsPerPixel = CHANNELS[colorType] * bitDepth;
  return (interlaced ? ADAM7 : WHOLE)
    .map(([x0, y0, dx, dy]) => {
      const w = Math.ceil((width - x0) / dx);
      const h = Math.ceil((height - y0) / dy);
      return { x0, y0, dx, dy, width: w, height: h, rowBytes: Math.ceil((w * bitsPerPixel) / 8) };
    })
    .filter((pass) => pass.width > 0 && pass.height > 0);
}

interface Inflated {
  /** The scanlines; missing ones are zero (filter none, every sample 0). */
  raw: Uint8Array;
  /**
   * Whether the data was exactly the scanlines, its zlib checksum correct:
   * only then can a PDF viewer inflate it unaided.
   */
  whole: boolean;
}

/**
 * `data` inflated into the scanlines `passes` call for, or null when it
 * breaks off before the picture's end or holds a filter byte PNG does not
 * have (above 4). Whatever follows the last scanline, data or an error, is
 * ignored, as browsers ignore it.
 */
async function inflateScanlines(data: Uint8Array<ArrayBuffer>, passes: Pass[]): Promise<Inflated | null> {
  const expected = passes.reduce((sum, p) => sum + p.height * (p.rowBytes + 1), 0);
  const raw = new Uint8Array(expected);
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  let got = 0;
  let clean = true;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw.set(value.subarray(0, Math.max(0, expected - got)), got);
      got += value.length;
      if (got > expected) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    // A broken stream, cut-off data or a wrong checksum.
    clean = false;
  }
  if (!clean && got < expected) return null;
  let row = 0;
  for (const pass of passes) {
    for (let y = 0; y < pass.height; y++, row += pass.rowBytes + 1) {
      if (raw[row] > 4) return null;
    }
  }
  return { raw, whole: clean && got === expected };
}

/** PNG's filter predictor for byte `a` (left), `b` (up), `c` (up-left). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

interface Pixels {
  /** 8-bit RGB, rows from the top. */
  rgb: Uint8Array;
  /** 8-bit alpha, present only when some pixel is not opaque. */
  alpha?: Uint8Array;
}

/**
 * The pixels of `png`'s scanlines `raw` (unfiltered here, in place), at 8
 * bits a sample: a 16-bit sample keeps its high byte, a 1, 2 or 4-bit grey
 * is scaled to 0–255, a palette index looks its colour up (one past the
 * palette shows black), and tRNS makes a colour key or palette entries
 * clear.
 */
function decodePixels(raw: Uint8Array, png: PngChunks, passes: Pass[]): Pixels {
  const { width, height, bitDepth, colorType } = png.header;
  const channels = CHANNELS[colorType];
  const bpp = Math.max(1, (channels * bitDepth) >> 3);
  const scale = bitDepth < 8 ? 255 / ((1 << bitDepth) - 1) : 1;
  const trns = png.transparency;
  // Empty unless indexed: readChunks returns no palette PNG without its palette.
  const palette = png.palette ?? new Uint8Array(0);
  const key =
    trns && (colorType === ColorType.grey || colorType === ColorType.rgb)
      ? Array.from({ length: trns.length >> 1 }, (_, i) => (trns[i * 2] << 8) | trns[i * 2 + 1])
      : null;
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height).fill(255);
  let anyClear = false;
  const sample = (row: Uint8Array, i: number): number => {
    if (bitDepth === 16) return (row[i * 2] << 8) | row[i * 2 + 1];
    if (bitDepth === 8) return row[i];
    const bit = i * bitDepth;
    return (row[bit >> 3] >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
  };
  const to8 = (v: number) => (bitDepth === 16 ? v >> 8 : Math.round(v * scale));

  let at = 0;
  for (const pass of passes) {
    let prior: Uint8Array = new Uint8Array(pass.rowBytes);
    for (let py = 0; py < pass.height; py++, at += pass.rowBytes + 1) {
      const filter = raw[at];
      const row = raw.subarray(at + 1, at + 1 + pass.rowBytes);
      for (let i = 0; i < row.length; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prior[i];
        const c = i >= bpp ? prior[i - bpp] : 0;
        const predicted =
          filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        row[i] = (row[i] + predicted) & 0xff;
      }
      prior = row;
      for (let px = 0; px < pass.width; px++) {
        const p = (pass.y0 + py * pass.dy) * width + pass.x0 + px * pass.dx;
        const o = px * channels;
        let r: number;
        let g: number;
        let b: number;
        let a = 255;
        if (colorType === ColorType.indexed) {
          const index = sample(row, o);
          const inPalette = index * 3 < palette.length;
          r = inPalette ? palette[index * 3] : 0;
          g = inPalette ? palette[index * 3 + 1] : 0;
          b = inPalette ? palette[index * 3 + 2] : 0;
          if (trns && index < trns.length) a = trns[index];
        } else if (colorType === ColorType.rgb || colorType === ColorType.rgba) {
          const [sr, sg, sb] = [sample(row, o), sample(row, o + 1), sample(row, o + 2)];
          [r, g, b] = [to8(sr), to8(sg), to8(sb)];
          if (colorType === ColorType.rgba) a = to8(sample(row, o + 3));
          else if (key?.length === 3 && sr === key[0] && sg === key[1] && sb === key[2]) a = 0;
        } else {
          const sv = sample(row, o);
          r = g = b = to8(sv);
          if (colorType === ColorType.greyAlpha) a = to8(sample(row, o + 1));
          else if (key?.length === 1 && sv === key[0]) a = 0;
        }
        rgb[p * 3] = r;
        rgb[p * 3 + 1] = g;
        rgb[p * 3 + 2] = b;
        alpha[p] = a;
        if (a < 255) anyClear = true;
      }
    }
  }
  return anyClear ? { rgb, alpha } : { rgb };
}

/**
 * `samples` (8-bit, `channels` per pixel, rows from the top) as PNG
 * scanlines: each row behind the filter byte that leaves the smallest sum of
 * signed residues, libpng's heuristic.
 */
function pngFiltered(samples: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(height * (stride + 1));
  const zeros = new Uint8Array(stride);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = samples.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? samples.subarray((y - 1) * stride, y * stride) : zeros;
    let best = 0;
    let bestCost = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      const residues = candidates[filter];
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = up[i];
        const c = i >= channels ? up[i - channels] : 0;
        const predicted =
          filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const residue = (row[i] - predicted) & 0xff;
        residues[i] = residue;
        cost += residue < 128 ? residue : 256 - residue;
        if (cost >= bestCost) break;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = filter;
      }
    }
    const at = y * (stride + 1);
    out[at] = best;
    // The best candidate was computed in full: a candidate stops early only
    // once it is already worse than the best so far.
    out.set(candidates[best], at + 1);
  }
  return out;
}

/** FlateDecode's parameters for PNG-predicted rows (a filter byte per row). */
const pngDecodeParms = (colors: number, bitsPerComponent: number, columns: number) => ({
  Predictor: 15,
  Colors: colors,
  BitsPerComponent: bitsPerComponent,
  Columns: columns,
});

/**
 * `data` deflated as a zlib stream (FlateDecode's) by the platform's own
 * zlib: several times faster than pdf-lib's flateStream (pako, in
 * JavaScript) on predicted rows, the step that took most of the time.
 */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // Copied into a fresh buffer: a Blob takes only ArrayBuffer-backed views.
  const compressed = new Blob([Uint8Array.from(data)]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

/** Rows per band, and bands, of the sample `predictorsPay` deflates both ways. */
const TRIAL_BAND_ROWS = 16;
const TRIAL_BANDS = 4;

/**
 * Whether `samples` deflate smaller with PNG predictors than without, judged
 * on a few bands of rows spread over the picture rather than on the whole,
 * which would deflate it twice. Predictors win on photos and gradients;
 * flat-coloured art (a few colours, hard edges) deflates smaller as it is,
 * which is why libpng leaves such pictures unfiltered.
 */
async function predictorsPay(samples: Uint8Array, width: number, height: number, channels: number): Promise<boolean> {
  const stride = width * channels;
  const bands = Math.min(TRIAL_BANDS, Math.ceil(height / TRIAL_BAND_ROWS));
  let predicted = 0;
  let plain = 0;
  for (let band = 0; band < bands; band++) {
    const top = Math.floor(((height - TRIAL_BAND_ROWS) * band) / Math.max(1, bands - 1));
    const first = Math.max(0, top);
    const rows = Math.min(TRIAL_BAND_ROWS, height - first);
    const slice = samples.subarray(first * stride, (first + rows) * stride);
    predicted += (await deflate(pngFiltered(slice, width, rows, channels))).length;
    plain += (await deflate(slice)).length;
  }
  return predicted <= plain;
}

/** An 8-bit image of `channels` (1 grey, 3 RGB), deflated with PNG predictors when they pay; its reference. */
async function registerDeflated(
  doc: PDFDocument,
  samples: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3,
  smask?: PDFRef,
): Promise<PDFRef> {
  const dict = {
    Type: "XObject",
    Subtype: "Image",
    Width: width,
    Height: height,
    BitsPerComponent: 8,
    ColorSpace: channels === 1 ? "DeviceGray" : "DeviceRGB",
    SMask: smask,
    Filter: "FlateDecode",
  };
  const stream = (await predictorsPay(samples, width, height, channels))
    ? doc.context.stream(await deflate(pngFiltered(samples, width, height, channels)), {
        ...dict,
        DecodeParms: pngDecodeParms(channels, 8, width),
      })
    : doc.context.stream(await deflate(samples), dict);
  return doc.context.register(stream);
}

/** The soft mask for `alpha`, or undefined when every pixel is opaque (pdf-lib leaves it out then). */
async function softMask(doc: PDFDocument, alpha: Uint8Array | undefined, width: number, height: number) {
  return alpha ? await registerDeflated(doc, alpha, width, height, 1) : undefined;
}

/** Whether every pixel of `rgb` is grey (R = G = B). */
function isGrey(rgb: Uint8Array): boolean {
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] !== rgb[i + 1] || rgb[i] !== rgb[i + 2]) return false;
  }
  return true;
}

/** Whether a PDF image can hold `png`'s data as it is: no alpha channel, no colour key, not interlaced. */
function passesThrough({ header, transparency }: PngChunks): boolean {
  const { colorType, interlaced } = header;
  if (interlaced) return false;
  if (colorType === ColorType.indexed) return true;
  return (colorType === ColorType.grey || colorType === ColorType.rgb) && !transparency;
}

/** `png`'s own data as an image stream; a palette's clear entries as the soft mask `alpha`. */
async function registerAsIs(doc: PDFDocument, png: PngChunks, alpha: Uint8Array | undefined): Promise<PDFRef> {
  const { width, height, bitDepth, colorType } = png.header;
  const colors = colorType === ColorType.rgb ? 3 : 1;
  const colorSpace =
    colorType === ColorType.indexed
      ? // Non-null: readChunks returns no palette PNG without its palette. The
        // lookup is a binary stream: as a string pdf-lib writes it in hex,
        // twice the palette's size.
        ["Indexed", "DeviceRGB", png.palette!.length / 3 - 1, doc.context.register(doc.context.stream(png.palette!))]
      : colors === 3
        ? "DeviceRGB"
        : "DeviceGray";
  return doc.context.register(
    doc.context.stream(png.data, {
      Type: "XObject",
      Subtype: "Image",
      Width: width,
      Height: height,
      BitsPerComponent: bitDepth,
      ColorSpace: colorSpace,
      SMask: await softMask(doc, alpha, width, height),
      Filter: "FlateDecode",
      DecodeParms: pngDecodeParms(colors, bitDepth, width),
    }),
  );
}

/**
 * Embed `bytes`, a PNG, as a lossless image of `doc`, no larger than the
 * PNG's own data where it can go in as is. Throws an invalid-input error for
 * a PNG it cannot read.
 */
export async function embedPng(doc: PDFDocument, bytes: Uint8Array): Promise<EmbeddedImage> {
  const png = readChunks(bytes);
  // The file is not a PNG this or any decoder can read: the user's file, not the tool.
  if (!png) throw new Error(`${INVALID_INPUT_PREFIX}: not a readable PNG image`);
  const passes = passesOf(png.header);
  const inflated = await inflateScanlines(png.data, passes);
  if (!inflated) throw new Error(`${INVALID_INPUT_PREFIX}: the PNG's image data is damaged`);
  const { raw, whole } = inflated;
  const { width, height } = png.header;

  if (whole && passesThrough(png)) {
    // Only a palette's clear entries need the pixels decoded.
    const alpha = png.transparency ? decodePixels(raw, png, passes).alpha : undefined;
    return { ref: await registerAsIs(doc, png, alpha), width, height };
  }

  const { rgb, alpha } = decodePixels(raw, png, passes);
  const smask = await softMask(doc, alpha, width, height);
  if (isGrey(rgb)) {
    const grey = new Uint8Array(width * height);
    for (let p = 0; p < grey.length; p++) grey[p] = rgb[p * 3];
    return { ref: await registerDeflated(doc, grey, width, height, 1, smask), width, height };
  }
  return { ref: await registerDeflated(doc, rgb, width, height, 3, smask), width, height };
}
