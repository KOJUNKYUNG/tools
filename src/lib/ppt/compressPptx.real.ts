// Real-file regression set entry for ppt-compress (`pnpm test:real`).
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { compressPptxFromBytes, type CompressPptxResult, type RecompressMedia } from "./compressPptx";
import { checkPptCompress, type PptCompressRequest } from "./pptCompressCheck";

/**
 * Node has no canvas, so a lossless re-encoder stands in for the browser's:
 * a PNG's pixel data is re-deflated at the highest level, and a JPEG loses
 * its EXIF/XMP (APP1), Photoshop (APP13) and comment segments. Both keep
 * every pixel, so the engine's bookkeeping (keep smaller, keep the original
 * on a bad candidate, repackage) runs on real decks. A JPEG whose EXIF turned
 * it changes shape when the tag goes, which exercises the keep-original path.
 * The preset sets JPEG quality and the PNG colour budget, both of which
 * this stand-in ignores, so one preset covers what it can exercise.
 */
const reencode: RecompressMedia = async (bytes, action) =>
  action.kind === "png" ? redeflatePng(bytes) : stripJpegMetadata(bytes);

function redeflatePng(bytes: Uint8Array): Uint8Array {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const before: Buffer[] = [];
  const after: Buffer[] = [];
  const idat: Buffer[] = [];
  for (let at = 8; at + 12 <= buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const chunk = buf.subarray(at, at + 12 + length);
    if (type === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + length));
    else (idat.length === 0 ? before : after).push(chunk);
    at += 12 + length;
  }
  const data = deflateSync(inflateSync(Buffer.concat(idat)), { level: 9 });
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("IDAT", 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return Uint8Array.from(Buffer.concat([buf.subarray(0, 8), ...before, chunk, ...after]));
}

const METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]); // APP1, APP13, COM

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  // Segments up to start-of-scan; the scan and everything after is copied.
  while (at + 4 <= bytes.length && bytes[at] === 0xff && bytes[at + 1] !== 0xda) {
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (!METADATA_MARKERS.has(bytes[at + 1])) kept.push(bytes.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  kept.push(bytes.subarray(at));
  return Uint8Array.from(Buffer.concat(kept));
}

const requests = async (): Promise<RealFileRequest<PptCompressRequest>[]> => [
  { label: "medium (default)", request: { preset: "medium" } },
];

realFileSuite<PptCompressRequest, CompressPptxResult>({
  tool: "ppt-compress",
  extensions: [".pptx"],
  requests,
  run: (bytes, { preset }) => compressPptxFromBytes({ bytes, preset, recompress: reencode }),
  check: async (input, request, result, depth) => {
    if (result.kind === "compressed") {
      return checkPptCompress(input, request, result.data, depth);
    }
    // Nothing is offered, so the only claim to hold is that it did not shrink.
    return result.compressedSize >= result.originalSize
      ? []
      : [{ property: SIZE_BOUND, detail: "reported not-smaller, yet smaller" }];
  },
});
