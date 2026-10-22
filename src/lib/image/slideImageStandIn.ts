// Test-only stand-in for the browser slide image preparer (never imported by the app).
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import {
  fittedSize,
  preparedFormat,
  type PixelSize,
  type PrepareSlideImage,
} from "./slideImage";

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * An image whose header reads as `format` at `size` but which holds no pixels,
 * tagged so that different sources give different bytes. Header readers and
 * byte comparisons accept it; a decoder would not.
 */
export function headerOnlyImage(format: "png" | "jpeg", size: PixelSize, tag: Uint8Array): Uint8Array {
  if (format === "png") {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size.width, 0);
    ihdr.writeUInt32BE(size.height, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
    return Uint8Array.from(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("tsTg", tag), // private, ancillary
        pngChunk("IEND", new Uint8Array(0)),
      ]),
    );
  }
  const segment = (marker: number, data: Uint8Array) => {
    const out = Buffer.alloc(4 + data.length);
    out.set([0xff, marker], 0);
    out.writeUInt16BE(2 + data.length, 2);
    out.set(data, 4);
    return out;
  };
  const frame = Buffer.alloc(15);
  frame[0] = 8; // precision
  frame.writeUInt16BE(size.height, 1);
  frame.writeUInt16BE(size.width, 3);
  frame.set([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 5);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xfe, tag), // comment
      segment(0xc0, frame),
      Buffer.from([0xff, 0xd9]),
    ]),
  );
}

/**
 * Stands in for `prepareSlideImage` in Node: the real sizing and format
 * decisions, a header-only image at that size.
 */
export const standInPrepare: PrepareSlideImage = async (source, crop, slide) => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  const format = preparedFormat(bytes);
  const size = fittedSize(crop, slide);
  const tag = createHash("sha256").update(bytes).update(JSON.stringify(crop)).digest();
  return { bytes: headerOnlyImage(format, size, tag), format, ...size };
};
