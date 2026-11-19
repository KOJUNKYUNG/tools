// Photo info removal for JPEGs (CONTEXT "Photo info"): a JPEG keeps its
// pictures' bytes but loses what a camera or editor wrote beside them, cut
// out segment by segment, never re-encoded. Shared so any tool that passes a
// user's JPEG through unchanged can drop the same record; image-to-pdf and
// pdf-arrange use it through the PDF assembler.
//
// Kept: every segment the decoder needs (tables, frame and scan headers,
// restart interval), JFIF's APP0 (pixel density), the ICC colour profile
// (APP2 "ICC_PROFILE"), which the colours depend on, and Adobe's APP14,
// which says how the colour channels are stored. Dropped: every other APPn
// segment (EXIF and XMP in APP1, multi-picture indexes and FlashPix in APP2,
// Photoshop's IPTC in APP13, maker blocks elsewhere), comments (COM), and
// whatever follows the end of the image (appended gain maps, motion-photo
// video, second pictures). Stray bytes between segments, which decoders
// skip, are dropped too. A truncated JPEG, with no end marker, keeps its
// scan data as it is.

import { INVALID_INPUT_PREFIX } from "@/lib/errors";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const APP0 = 0xe0;
const APP2 = 0xe2;
const APP14 = 0xee;
const APP15 = 0xef;

const startsWith = (bytes: Uint8Array, at: number, end: number, text: string) =>
  end - at >= text.length && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/**
 * Whether the segment with `marker` and payload `bytes[at..end)` is photo
 * info rather than something the picture needs.
 */
function isPhotoInfo(marker: number, bytes: Uint8Array, at: number, end: number): boolean {
  if (marker === COM) return true;
  if (marker < APP0 || marker > APP15) return false;
  if (marker === APP0) return !startsWith(bytes, at, end, "JFIF\0");
  if (marker === APP2) return !startsWith(bytes, at, end, "ICC_PROFILE\0");
  if (marker === APP14) return !startsWith(bytes, at, end, "Adobe");
  return true;
}

/** Markers that stand alone, without a length field (TEM, RSTn, SOI, EOI). */
const isStandalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= SOI);

const notJpeg = () => new Error(`${INVALID_INPUT_PREFIX}: not a readable JPEG image`);

/**
 * Where the entropy-coded data that starts at `from` ends: the next marker
 * that is neither a stuffed 0xFF (FF 00) nor a restart marker (FF D0–D7),
 * or the end of the bytes for a truncated file.
 */
function endOfScanData(bytes: Uint8Array, from: number): number {
  let at = bytes.indexOf(0xff, from);
  while (at !== -1 && at + 1 < bytes.length) {
    const next = bytes[at + 1];
    if (next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) return at;
    // FF FF is fill before a marker: look again from the second FF.
    at = bytes.indexOf(0xff, next === 0xff ? at + 1 : at + 2);
  }
  return bytes.length;
}

/**
 * `jpeg` without its photo info: the segments the picture needs, in order,
 * byte for byte, ending at its end-of-image marker. Returns `jpeg` itself
 * when there is nothing to drop. Throws the invalid-input error when its
 * marker structure is broken, since what to keep could not be told apart,
 * or when it holds no scan: cut off before its picture, it has none to show.
 */
export function stripPhotoInfo(jpeg: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== SOI) throw notJpeg();
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  const kept: [number, number][] = [[0, 2]];
  let at = 2;
  let hasScan = false;

  while (at < jpeg.length) {
    if (jpeg[at] !== 0xff) {
      // Stray bytes before the next marker: skipped, as decoders do.
      at = jpeg.indexOf(0xff, at);
      if (at === -1) throw notJpeg();
      continue;
    }
    const marker = jpeg[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if (marker === EOI) {
      kept.push([at, at + 2]);
      break;
    }
    if (isStandalone(marker)) {
      kept.push([at, at + 2]);
      at += 2;
      continue;
    }
    if (at + 4 > jpeg.length) throw notJpeg();
    const segmentEnd = at + 2 + view.getUint16(at + 2);
    if (segmentEnd > jpeg.length || segmentEnd < at + 4) throw notJpeg();
    if (marker === SOS) {
      hasScan = true;
      // The scan header, then its entropy-coded data up to the next marker.
      const dataEnd = endOfScanData(jpeg, segmentEnd);
      kept.push([at, dataEnd]);
      at = dataEnd;
      continue;
    }
    if (!isPhotoInfo(marker, jpeg, at + 4, segmentEnd)) kept.push([at, segmentEnd]);
    at = segmentEnd;
  }

  if (!hasScan) throw notJpeg();
  const size = kept.reduce((sum, [from, to]) => sum + to - from, 0);
  if (size === jpeg.length) return jpeg;
  const out = new Uint8Array(size);
  let written = 0;
  for (const [from, to] of kept) {
    out.set(jpeg.subarray(from, to), written);
    written += to - from;
  }
  return out;
}
