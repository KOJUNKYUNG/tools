import CFB from "cfb";
import { describe, expect, it } from "vitest";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import { JPEG_3x2, solidPng } from "@/lib/pdf/testImages";
import { extractPptImages, type ExtractedImage } from "./extractImages";
import { checkPptExtract } from "./extractImagesCheck";

// Smallest valid headers for the formats a .ppt embeds besides PNG and JPEG.

/** An EMF: its EMR_HEADER record (type 1, " EMF" at 40) and an EOF record. */
function emf(): Uint8Array {
  const b = Buffer.alloc(108);
  b.writeUInt32LE(1, 0); // EMR_HEADER
  b.writeUInt32LE(88, 4);
  b.write(" EMF", 40, "ascii");
  b.writeUInt32LE(0x10000, 44);
  b.writeUInt32LE(108, 48);
  b.writeUInt32LE(14, 88); // EMR_EOF
  b.writeUInt32LE(20, 92);
  return Uint8Array.from(b);
}

/** A WMF without a placeable header: META_HEADER (disk, 9 words, 0x0300). */
function wmf(): Uint8Array {
  const b = Buffer.alloc(24);
  b.writeUInt16LE(1, 0);
  b.writeUInt16LE(9, 2);
  b.writeUInt16LE(0x0300, 4);
  b.writeUInt32LE(12, 6);
  b.writeUInt16LE(3, 18); // META_EOF: size 3 words, function 0
  return Uint8Array.from(b);
}

/** The same WMF behind a placeable header (key 9AC6CDD7). */
function placeableWmf(): Uint8Array {
  const head = Buffer.alloc(22);
  head.writeUInt32LE(0x9ac6cdd7, 0);
  return Uint8Array.from(Buffer.concat([head, wmf()]));
}

/** A 1×1 24-bit BMP: file header, BITMAPINFOHEADER, one padded row. */
function bmp(): Uint8Array {
  const b = Buffer.alloc(58);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(58, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(1, 18);
  b.writeInt32LE(1, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  return Uint8Array.from(b);
}

/** A TIFF: header and an empty first IFD, little- or big-endian. */
function tiff(byteOrder: "II" | "MM" = "II"): Uint8Array {
  const b = Buffer.alloc(14);
  b.write(byteOrder, 0, "ascii");
  if (byteOrder === "II") {
    b.writeUInt16LE(42, 2);
    b.writeUInt32LE(8, 4);
  } else {
    b.writeUInt16BE(42, 2);
    b.writeUInt32BE(8, 4);
  }
  return Uint8Array.from(b);
}

const file = (name: string, data: Uint8Array): ExtractedImage => ({
  name,
  data,
  mime: "application/octet-stream",
  size: data.length,
});

const properties = (violations: { property: string }[]) => violations.map((v) => v.property);

/** Any .ppt input: the checker reads only its signature. */
const PPT_INPUT = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const check = (images: ExtractedImage[]) => checkPptExtract(PPT_INPUT, undefined, images, "quick");

describe("checkPptExtract (.ppt): every file's header matches its extension", () => {
  it("accepts every format the tool carves out of a .ppt", async () => {
    const good = [
      file("image_1.jpg", JPEG_3x2),
      file("image_1.png", solidPng(2, 2)),
      file("image_1.emf", emf()),
      file("image_1.wmf", wmf()),
      file("image_2.wmf", placeableWmf()),
      file("image_1.bmp", bmp()),
      file("image_1.tiff", tiff("II")),
      file("image_2.tiff", tiff("MM")),
    ];
    expect(await check(good)).toEqual([]);
  });

  it.each([
    ["image_1.jpg", solidPng(2, 2)],
    ["image_1.png", JPEG_3x2],
    ["image_1.bmp", tiff()],
    ["image_1.tiff", bmp()],
    ["image_1.wmf", emf()],
    ["image_1.emf", wmf()],
  ])("flags %s holding another format", async (name, data) => {
    expect(properties(await check([file(name, data)]))).toEqual(["image-header"]);
  });

  it.each([
    // The engine's own magic bytes, but no real header behind them.
    ["image_1.emf", Uint8Array.from([1, 0, 0, 0, 0x78, 0x9c, ...new Array(60).fill(7)])],
    ["image_1.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, ...new Array(20).fill(0)])],
    ["image_1.jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ["image_1.bmp", Uint8Array.from([0x42, 0x4d, ...new Array(30).fill(0xee)])],
    ["image_1.tiff", Uint8Array.from([0x49, 0x49, 0x2a, 0, 0xff, 0xff, 0, 0])],
    ["image_1.wmf", Uint8Array.from([0xd7, 0xcd, 0xc6, 0x9a, ...new Array(40).fill(0)])],
  ])("flags %s that only starts like its format", async (name, data) => {
    expect(properties(await check([file(name, data)]))).toEqual(["image-header"]);
  });
});

// ---------------------------------------------------------------------------
// The engine entry, on .ppt files built in the test.

/** One BLIP record: header, `pad` bytes standing in for the UID and tag, the data. */
function blip(recType: number, data: Uint8Array, pad: number): Uint8Array {
  const out = Buffer.alloc(8 + pad + data.length);
  out.writeUInt16LE(recType, 2);
  out.writeUInt32LE(pad + data.length, 4);
  out.set(data, 8 + pad);
  return Uint8Array.from(out);
}

/** A .ppt (compound file) whose Pictures stream holds `records`. */
function pptWith(...records: Uint8Array[]): Uint8Array {
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "/Pictures", Buffer.concat(records));
  // `as`: CFB.write is typed `any`; type "buffer" returns a Buffer.
  return Uint8Array.from(CFB.write(cfb, { type: "buffer" }) as Buffer);
}

const extract = (bytes: Uint8Array) =>
  extractPptImages({ file: new File([new Uint8Array(bytes)], "deck.ppt") });

describe("extractPptImages (.ppt) output check", () => {
  it("passes the full check on a good .ppt", async () => {
    const deck = pptWith(
      blip(0xf01d, JPEG_3x2, 17),
      blip(0xf01e, solidPng(3, 3), 17),
      blip(0xf01a, emf(), 50),
      blip(0xf01f, bmp(), 17),
      blip(0xf029, tiff(), 17),
    );
    const images = await extract(deck);
    expect(images.map((i) => i.name)).toEqual([
      "image_1.jpg",
      "image_1.png",
      "image_1.emf",
      "image_1.bmp",
      "image_1.tiff",
    ]);
    expect(await checkPptExtract(deck, undefined, images, "full")).toEqual([]);
  });

  it("blocks a metafile carved from the wrong offset", async () => {
    // A compressed EMF blip: UID, then a metafile header whose bounds start
    // with 1 (read by the engine as an EMF's first bytes), then deflate data.
    const header = Buffer.alloc(34);
    header.writeUInt32LE(0x400, 0); // uncompressed size
    header.writeInt32LE(1, 4); // bounds.left
    header[32] = 0x00; // DEFLATE
    header[33] = 0xfe;
    const compressed = Buffer.from([0x78, 0x9c, ...new Array(40).fill(0x55)]);
    const body = Uint8Array.from(Buffer.concat([Buffer.alloc(16), header, compressed]));
    const deck = pptWith(blip(0xf01d, JPEG_3x2, 17), blip(0xf01a, body, 0));
    await expect(extract(deck)).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });
});
