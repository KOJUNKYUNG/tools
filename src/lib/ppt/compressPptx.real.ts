// Real-file regression set entry for ppt-compress (`pnpm test:real`).
import { crc32, deflateSync, inflateSync } from "node:zlib";
import type { Violation } from "@/lib/output-check/core";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { solidPng, withJpegSize } from "@/lib/pdf/testImages";
import { compressPptxFromBytes, type CompressPptxResult, type RecompressMedia } from "./compressPptx";
import { readDisplaySizes } from "./displaySize";
import { checkPptCompress, type PptCompressRequest } from "./pptCompressCheck";
import { PRESET_SLIDE_WIDTH_PX } from "./pptCompressPlan";

/**
 * Node has no canvas, so a lossless re-encoder stands in for the browser's:
 * a PNG's pixel data is re-deflated at the highest level, and a JPEG loses
 * its EXIF/XMP (APP1), Photoshop (APP13) and comment segments. Both keep
 * every pixel, so the engine's bookkeeping (keep smaller, keep the original
 * on a bad candidate, repackage) runs on real decks. A JPEG whose EXIF turned
 * it changes shape when the tag goes, which exercises the keep-original path.
 *
 * Given a target size, it returns an image of that size, upright, whose
 * header reads correctly (a flat PNG; the JPEG's frame header rewritten, so
 * its scan no longer decodes): the checks read headers only, and this runs
 * the downsampling path's sizing on real decks. The preset's quality, which
 * it ignores, is why the presets differ here only by their target.
 */
const reencode: RecompressMedia = async (bytes, action) => {
  if (action.target) {
    const { width, height } = action.target;
    return action.kind === "png"
      ? solidPng(width, height)
      : withJpegSize(stripJpegMetadata(bytes), width, height);
  }
  return action.kind === "png" ? redeflatePng(bytes) : stripJpegMetadata(bytes);
};

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
  { label: "high", request: { preset: "high" } },
];

/**
 * The "too small" guard, kept out of the run-time check on purpose (see
 * pptCompressCheck.ts): every picture whose displayed size changed had a
 * known display size, and still holds at least that many pixels on each
 * side at the preset's slide width.
 */
async function belowDisplaySize(
  input: Uint8Array,
  { preset }: PptCompressRequest,
  output: Uint8Array,
): Promise<Violation[]> {
  const [before, after] = await Promise.all([openPptxPackage(input), openPptxPackage(output)]);
  if (!before || !after) return [];
  const sizes = await readDisplaySizes(input);
  const slideWidth = PRESET_SLIDE_WIDTH_PX[preset];
  const violations: Violation[] = [];
  for (const [part, display] of sizes) {
    const [original, recompressed] = await Promise.all([before.read(part), after.read(part)]);
    const was = original && readImageHeader(original);
    const now = recompressed && readImageHeader(recompressed);
    if (!was || !now) continue;
    const [w, h] = displayedSize(was);
    const [ow, oh] = displayedSize(now);
    if (ow === w && oh === h) continue;
    if (display === null || slideWidth === null) {
      violations.push({ property: "display-size", detail: `${part}: resized without a display size` });
      continue;
    }
    const [needW, needH] = [display.width, display.height].map((d) => Math.ceil(d * slideWidth));
    if (ow < needW || oh < needH) {
      violations.push({
        property: "display-size",
        detail: `${part}: ${ow}×${oh}, needs ${needW}×${needH}`,
      });
    }
  }
  return violations;
}

realFileSuite<PptCompressRequest, CompressPptxResult>({
  tool: "ppt-compress",
  extensions: [".pptx"],
  requests,
  run: (bytes, { preset }) => compressPptxFromBytes({ bytes, preset, recompress: reencode }),
  check: async (input, request, result, depth) => {
    if (result.kind === "compressed") {
      const violations = await checkPptCompress(input, request, result.data, depth);
      if (depth === "full") violations.push(...(await belowDisplaySize(input, request, result.data)));
      return violations;
    }
    // Nothing is offered, so the only claim to hold is that it did not shrink.
    return result.compressedSize >= result.originalSize
      ? []
      : [{ property: SIZE_BOUND, detail: "reported not-smaller, yet smaller" }];
  },
});
