// Test-only image fixtures, generated in Node (never imported by the app).
import { crc32, deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { vi } from "vitest";
import { type TestPngOptions, testPng } from "@/lib/image/testPng";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import type { PageItem, Rotation } from "./pageItem";

/** A solid grey 8-bit RGB PNG of the given size. */
export function solidPng(width: number, height: number): Uint8Array {
  return rgbPng(width, height, () => 0x80);
}

/** An 8-bit RGB PNG of random pixels: it barely compresses. */
export function noisePng(width: number, height: number): Uint8Array {
  return rgbPng(width, height, () => Math.floor(Math.random() * 256));
}

function rgbPng(width: number, height: number, sample: () => number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    out.set(data, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const rows = Array.from({ length: height }, () => {
    const row = Buffer.alloc(1 + width * 3);
    for (let i = 1; i < row.length; i++) row[i] = sample();
    return row; // row[0] = 0: filter none
  });
  const pixels = Buffer.concat(rows);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}

/**
 * The most a one-picture PDF may add to the PNG it holds: the file's header,
 * catalogue and cross-references, a page, its content stream and the
 * picture's dictionary, plus the soft mask a PNG's transparency becomes (a
 * palette's tRNS chunk takes a byte per colour, the mask a byte per pixel
 * before compression).
 */
export const PNG_PAGE_OVERHEAD = 1536;

const clamp = (v: number) => Math.max(0, Math.min(255, v));
/** Seeded by position, not call order: interlaced PNGs ask for pixels pass by pass. */
const noise = (x: number, y: number) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 7 - 3;
/** A 16-bit sample whose 8-bit reading is `v` whether a viewer drops the low byte or rounds. */
const wide = (v: number, x: number) => v * 256 + (v >> 1) + (x % 64);
const KEY_GREEN: [number, number, number] = [0, 255, 0];
const PALETTE = Array.from({ length: 200 }, (_, i): [number, number, number] => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]);
const PALETTE_ALPHA = [0, 128, 200];
const FLAT_COLOURS: [number, number, number][] = [[230, 57, 70], [29, 53, 87], [241, 250, 238], [69, 123, 157]];

interface Kind {
  options: Omit<TestPngOptions, "width" | "height" | "pixel">;
  /** The samples stored at (x, y), and what a viewer shows there (8-bit RGBA). */
  pixel: (x: number, y: number) => { samples: number[]; shown: number[] };
}

/** Noisy gradients: they compress like real pictures, only with PNG's predictors. */
const grey = (x: number, y: number) => clamp(x * 2 + y + noise(x, y));
const rgb = (x: number, y: number) => [grey(x, y), clamp(y * 3 + noise(y, x)), clamp(x + y * 2 + noise(x + 1, y))];
const alpha = (x: number, y: number) => (x * 9 + y * 5) % 256;

const KINDS = {
  truecolour: {
    options: { colorType: 2 },
    pixel: (x, y) => ({ samples: rgb(x, y), shown: [...rgb(x, y), 255] }),
  },
  "truecolour with alpha": {
    options: { colorType: 6 },
    pixel: (x, y) => ({ samples: [...rgb(x, y), alpha(x, y)], shown: [...rgb(x, y), alpha(x, y)] }),
  },
  "truecolour with a transparent colour": {
    options: { colorType: 2, trns: KEY_GREEN },
    // The gradient's green stays below 255, so only these pixels are the key.
    pixel: (x, y) =>
      (x + y) % 11 === 0 ? { samples: KEY_GREEN, shown: [...KEY_GREEN, 0] } : { samples: rgb(x, y), shown: [...rgb(x, y), 255] },
  },
  "16-bit truecolour": {
    options: { colorType: 2, bitDepth: 16 },
    pixel: (x, y) => ({ samples: rgb(x, y).map((v) => wide(v, x)), shown: [...rgb(x, y), 255] }),
  },
  palette: {
    options: { colorType: 3, palette: PALETTE },
    pixel: (x, y) => {
      const index = (x * 3 + y * 7 + (noise(x, y) & 1)) % PALETTE.length;
      return { samples: [index], shown: [...PALETTE[index], 255] };
    },
  },
  "4-bit palette with transparency": {
    options: { colorType: 3, bitDepth: 4, palette: PALETTE.slice(0, 16), trns: PALETTE_ALPHA },
    pixel: (x, y) => {
      const index = (Math.floor(x / 4) + Math.floor(y / 3)) % 16;
      return { samples: [index], shown: [...PALETTE[index], PALETTE_ALPHA[index] ?? 255] };
    },
  },
  "1-bit greyscale": {
    options: { colorType: 0, bitDepth: 1 },
    pixel: (x, y) => ((x >> 2) + (y >> 1)) % 3 === 0 ? { samples: [1], shown: [255, 255, 255, 255] } : { samples: [0], shown: [0, 0, 0, 255] },
  },
  greyscale: {
    options: { colorType: 0 },
    pixel: (x, y) => ({ samples: [grey(x, y)], shown: [grey(x, y), grey(x, y), grey(x, y), 255] }),
  },
  "16-bit greyscale": {
    options: { colorType: 0, bitDepth: 16 },
    pixel: (x, y) => ({ samples: [wide(grey(x, y), x)], shown: [grey(x, y), grey(x, y), grey(x, y), 255] }),
  },
  "greyscale with alpha": {
    options: { colorType: 4 },
    pixel: (x, y) => ({ samples: [grey(x, y), alpha(x, y)], shown: [grey(x, y), grey(x, y), grey(x, y), alpha(x, y)] }),
  },
  "flat-coloured art with alpha": {
    // Four colours in hard-edged blocks on a clear ground, like a drawn
    // illustration: deflates smaller unfiltered than with predictors.
    options: { colorType: 6 },
    pixel: (x, y) => {
      const inside = (x - 48) ** 2 + (y - 32) ** 2 < 900;
      const colour = FLAT_COLOURS[((x >> 4) + (y >> 3)) % FLAT_COLOURS.length];
      const shown = inside ? [...colour, 255] : [0, 0, 0, 0];
      return { samples: shown, shown };
    },
  },
  "interlaced truecolour": {
    options: { colorType: 2, interlace: true },
    pixel: (x, y) => ({ samples: rgb(x, y), shown: [...rgb(x, y), 255] }),
  },
} satisfies Record<string, Kind>;
export type PngKind = keyof typeof KINDS;
// Object.keys types its result string[]; the keys are KINDS' own.
export const PNG_KINDS = Object.keys(KINDS) as PngKind[];

export interface PngOfKind {
  bytes: Uint8Array;
  /** What a viewer shows: 8-bit RGBA, row by row from the top. */
  rgba: Uint8Array;
}

/**
 * A PNG of `kind` (encoded by the shared test encoder, its data over several
 * IDAT chunks) and the pixels it shows. Alpha, where the kind has it, runs
 * from clear to opaque; the 4-bit palette marks three colours clear or
 * part-clear.
 */
export function pngOfKind(kind: PngKind, width = 96, height = 64): PngOfKind {
  const { options, pixel }: Kind = KINDS[kind];
  const bytes = testPng({ ...options, width, height, idatChunks: 4, pixel: (x, y) => pixel(x, y).samples });
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set(pixel(x, y).shown, (y * width + x) * 4);
  }
  return { bytes, rgba };
}

/** `png` with its header claiming `height` rows, its image data left as it is. */
export function withPngHeight(png: Uint8Array, height: number): Uint8Array {
  const out = Buffer.from(png);
  out.writeUInt32BE(height, 8 + 8 + 4); // signature, IHDR's length and type, then width
  out.writeUInt32BE(crc32(out.subarray(12, 12 + 4 + 13)), 12 + 4 + 13);
  return Uint8Array.from(out);
}

/**
 * The pixels of the first picture page 1 paints, as pdf.js decodes them
 * (soft mask applied as alpha), in 8-bit RGBA.
 */
export async function firstPictureRgba(pdf: Uint8Array): Promise<Uint8Array> {
  const { nodePdfjsAdapter } = await import("@/lib/output-check/pdfjsNode");
  const { lib, docParams } = await nodePdfjsAdapter.load();
  const doc = await lib.getDocument({ ...docParams, data: pdf.slice(), verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(1);
    const { fnArray, argsArray } = await page.getOperatorList();
    type Decoded = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
    let image: Decoded | null = null;
    for (let i = 0; i < fnArray.length && !image; i++) {
      if (fnArray[i] === lib.OPS.paintInlineImageXObject) {
        // pdfjs passes small pictures inline, already decoded; its operator
        // arguments are typed any[], and an inline picture's first is the data.
        image = (argsArray[i] as [Decoded])[0];
      } else if (fnArray[i] === lib.OPS.paintImageXObject) {
        // An image XObject's first argument is the id its decoded data is kept under.
        const [id] = argsArray[i] as [string];
        image = await new Promise<Decoded>((resolve) => page.objs.get(id, resolve));
      }
    }
    if (!image) throw new Error("page 1 paints no picture");
    const { width, height, data } = image;
    if (data.length === width * height * 4) return Uint8Array.from(data);
    const rowBytes = Math.ceil(width / 8);
    if (data.length === rowBytes * height) {
      // 1 bit a pixel, rows padded to a byte, 1 white: pdf.js's GRAYSCALE_1BPP.
      const out = new Uint8Array(width * height * 4).fill(255);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
          out.set([v, v, v], (y * width + x) * 4);
        }
      }
      return out;
    }
    if (data.length !== width * height * 3) throw new Error(`unexpected picture data: ${data.length} bytes`);
    const out = new Uint8Array(width * height * 4).fill(255);
    for (let p = 0; p < width * height; p++) out.set(data.subarray(p * 3, p * 3 + 3), p * 4);
    return out;
  } finally {
    await doc.destroy();
  }
}

/** A 3×2 JPEG, encoded by a browser canvas. */
export const JPEG_3x2 = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWAAqu/9k=",
    "base64",
  ),
);

/** A 16×16 RGB JPEG 2000 codestream (no JP2 box), encoded by OpenJPEG. */
export const J2K_16x16 = Uint8Array.from(
  Buffer.from(
    "/0//UQAvAAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEABAQEAAD/XAAdQm8gbwBvAG7gZ1BnUGdoUAVQBVBHV9NX01di/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAJwAB/5OAgIDD9QIAAEeh+oEAAEeAgICAgICAgICA/9k=",
    "base64",
  ),
);

/**
 * `jpeg` with its frame header rewritten to `width`×`height`: header-correct
 * for the header inspector, though the scan no longer decodes.
 */
export function withJpegSize(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const out = Uint8Array.from(jpeg);
  const view = new DataView(out.buffer);
  for (let at = 2; at + 9 <= out.length && out[at] === 0xff; at += 2 + view.getUint16(at + 2)) {
    const marker = out[at + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      view.setUint16(at + 5, height);
      view.setUint16(at + 7, width);
      return out;
    }
  }
  throw new Error("no frame header");
}

/**
 * `jpeg` with an EXIF APP1 segment right after SOI whose IFD0 holds only the
 * Orientation tag, in big-endian ("MM") or little-endian ("II") byte order.
 */
export function withExifOrientation(
  jpeg: Uint8Array,
  orientation: number,
  byteOrder: "MM" | "II" = "MM",
): Uint8Array {
  const tiff = Buffer.alloc(26);
  const le = byteOrder === "II";
  const u16 = (v: number, at: number) => (le ? tiff.writeUInt16LE(v, at) : tiff.writeUInt16BE(v, at));
  const u32 = (v: number, at: number) => (le ? tiff.writeUInt32LE(v, at) : tiff.writeUInt32BE(v, at));
  tiff.write(byteOrder, 0, "ascii");
  u16(42, 2);
  u32(8, 4); // IFD0 offset
  u16(1, 8); // one entry
  u16(0x0112, 10); // Orientation
  u16(3, 12); // SHORT
  u32(1, 14); // count
  u16(orientation, 18); // value, left-justified in the 4-byte field
  u32(0, 22); // no next IFD
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  return Uint8Array.from(Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)]));
}

/** `png` with an eXIf chunk (orientation 6) between IHDR and the image data. */
export function withPngExif(png: Uint8Array): Uint8Array {
  const tiff = Buffer.from("4d4d002a00000008000101120003000000010006000000000000", "hex");
  const chunk = Buffer.alloc(12 + tiff.length);
  chunk.writeUInt32BE(tiff.length, 0);
  chunk.write("eXIf", 4, "ascii");
  tiff.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + tiff.length)), 8 + tiff.length);
  const afterIhdr = 8 + 25; // signature, then IHDR: length, type, 13 data bytes, CRC
  return Uint8Array.from(Buffer.concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]));
}

/**
 * Source images by id: a wide and a tall PNG, a small JPEG, and the same
 * JPEG tagged EXIF orientation 6 ("phone": stored 3×2, shown 2×3).
 */
export const imageSources = () =>
  new Map([
    ["wide", solidPng(40, 20)],
    ["tall", solidPng(10, 30)],
    ["photo", JPEG_3x2],
    ["phone", withExifOrientation(JPEG_3x2, 6)],
  ]);

/** An editor page showing the image `sourceFileId`, turned by `rotation`. */
export function imagePage(sourceFileId: string, rotation: Rotation = 0): PageItem {
  return {
    id: `${sourceFileId}-${rotation}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.img`,
    kind: "image",
    sourcePageIndex: 0,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

/**
 * Stands in for the browser's `createImageBitmap` in Node: it decodes what
 * the header inspector can read and rejects the rest, as a browser would.
 */
export function stubBrowserDecoder(): void {
  vi.stubGlobal("createImageBitmap", async (b: Blob) => {
    const header = readImageHeader(new Uint8Array(await b.arrayBuffer()));
    if (!header) throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    return { width: header.width, height: header.height, close: () => {} };
  });
}

/** A JPEG marker segment: FF, `marker`, a length, then `payload`. */
function segment(marker: number, payload: Uint8Array | string): Buffer {
  const data = typeof payload === "string" ? Buffer.from(payload, "latin1") : Buffer.from(payload);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
}

/** Where `jpeg`'s first start-of-scan marker sits (its segments walked from SOI). */
function startOfScan(jpeg: Uint8Array): number {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  for (let at = 2; at + 4 <= jpeg.length; at += 2 + view.getUint16(at + 2)) {
    if (jpeg[at + 1] === 0xda) return at;
  }
  throw new Error("no start of scan");
}

/**
 * `jpeg` carrying a phone's photo info: EXIF holding a GPS position and XMP
 * right after SOI, Photoshop's IPTC block, a comment and a multi-picture
 * index just before the image data, and a second picture (a gain map, as
 * Ultra HDR photos append) after its end. The colour profile and JFIF header
 * of `jpeg` stay where they are.
 */
export function withPhotoInfo(jpeg: Uint8Array): Uint8Array {
  // IFD0 holds one entry, the GPS IFD pointer; the GPS IFD holds the
  // latitude reference "N" (an ASCII value short enough to sit inline).
  const tiff = Buffer.from(
    "4d4d002a00000008" + // "MM", 42, IFD0 at 8
      "0001" + "88250004000000010000001a" + "00000000" + // GPSInfo → 26
      "0001" + "0001000200000002" + "4e000000" + "00000000", // GPSLatitudeRef "N"
    "hex",
  );
  const exif = segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]));
  const xmp = segment(
    0xe1,
    'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>37,33.5N</exif:GPSLatitude></x:xmpmeta>',
  );
  const iptc = segment(0xed, "Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\x0a\x1c\x02\x5a\0\x05Seoul");
  const comment = segment(0xfe, "Taken at home");
  const mpf = segment(0xe2, "MPF\0MM\0\x2a\0\0\0\x08");
  const gainMap = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<hdrgm/>"), Buffer.from([0xff, 0xd9])]);
  const sos = startOfScan(jpeg);
  return Uint8Array.from(
    Buffer.concat([
      jpeg.subarray(0, 2),
      exif,
      xmp,
      jpeg.subarray(2, sos),
      iptc,
      comment,
      mpf,
      jpeg.subarray(sos),
      gainMap,
    ]),
  );
}

/**
 * The JPEG streams (DCTDecode image XObjects) a PDF embeds, as stored, read
 * with pdf-lib's parser: independent of the output checks' own byte scan.
 */
export async function embeddedJpegs(pdf: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(pdf);
  const jpegs: Uint8Array[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const filter = object.dict.get(PDFName.of("Filter"));
    if (object.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (filter !== PDFName.of("DCTDecode")) continue;
    jpegs.push(object.contents);
  }
  return jpegs;
}
