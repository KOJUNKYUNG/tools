// Test-only image fixtures, generated in Node (never imported by the app).
import { crc32, deflateSync } from "node:zlib";
import { vi } from "vitest";
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

/** A 3×2 JPEG, encoded by a browser canvas. */
export const JPEG_3x2 = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWAAqu/9k=",
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
