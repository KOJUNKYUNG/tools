/**
 * Image header inspector: reads an image's format and pixel size straight
 * from its bytes, without decoding it, so image checks run in Node as in the
 * browser. Covers PNG, JPEG and WebP (lossy, lossless and extended).
 *
 * Sizes are the stored pixel grid. A JPEG's EXIF orientation, which browsers
 * apply when showing it, is reported separately (written independently of the
 * PDF engine's reader, so the two cannot share a bug). A WebP's EXIF chunk is
 * not read: its orientation is always reported as 1.
 */
export interface ImageHeader {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
  /** EXIF Orientation, 1–8; 1 (upright) when absent. 5–8 show it turned a quarter. */
  orientation: number;
}

/** Width and height as shown: EXIF orientations 5–8 turn the image a quarter. */
export function displayedSize({ width, height, orientation }: ImageHeader): [number, number] {
  return orientation >= 5 ? [height, width] : [width, height];
}

/** The header format a canvas writes for each MIME type it is asked to encode. */
export const HEADER_FORMAT_OF_MIME: Readonly<Partial<Record<string, ImageHeader["format"]>>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(bytes: Uint8Array): ImageHeader | null {
  // Signature, then the IHDR chunk: length (4), type (4), width, height.
  if (bytes.length < 24 || !ascii(bytes, 12, "IHDR")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20), orientation: 1 };
}

/** Start-of-frame markers (C0–CF except DHT C4, JPG C8, DAC CC) carry the size. */
const isFrameMarker = (m: number) =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** Markers that stand alone, without a length field. */
const isStandalone = (m: number) => (m >= 0xd0 && m <= 0xd9) || m === 0x01;

/**
 * IFD0's Orientation in the EXIF payload of an APP1 segment whose data starts
 * at `start` ("Exif" and two zero bytes, then a TIFF header) and ends at
 * `end`: null when the segment is not EXIF (XMP also uses APP1), 1 when it
 * is but holds no valid Orientation.
 */
function exifOrientation(view: DataView, start: number, end: number): number | null {
  if (end > view.byteLength || end - start < 6) return null;
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return null;
  if (end - start < 14) return 1;
  const tiff = start + 6;
  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1;
  const littleEndian = byteOrder === 0x4949;
  const ifd0 = tiff + view.getUint32(tiff + 4, littleEndian);
  if (ifd0 + 2 > end) return 1;
  const count = view.getUint16(ifd0, littleEndian);
  for (let i = 0; i < count && ifd0 + 2 + (i + 1) * 12 <= end; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (view.getUint16(entry, littleEndian) === 0x0112) {
      const value = view.getUint16(entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/**
 * Size from the frame header; orientation from the first EXIF segment before
 * the image data, wherever it sits (browsers read every metadata segment up
 * to start-of-scan, and follow the first EXIF one).
 */
function readJpeg(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size: { width: number; height: number } | null = null;
  let orientation: number | null = null;
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if (isStandalone(marker)) {
      at += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan: metadata is over
    if (at + 4 > bytes.length) break;
    if (isFrameMarker(marker)) {
      // Length (2), precision (1), height (2), width (2).
      if (at + 9 > bytes.length) return null;
      size ??= { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && orientation === null) {
      orientation = exifOrientation(view, at + 4, at + 2 + length);
    }
    at += 2 + length;
  }
  return size && { format: "jpeg", ...size, orientation: orientation ?? 1 };
}

/**
 * Size from the first chunk after the RIFF header ("RIFF", size, "WEBP"),
 * which the container spec fixes as one of three: `VP8 ` (lossy) carries a
 * key-frame header, `VP8L` (lossless) a bit-packed header, `VP8X` (extended)
 * the canvas size.
 */
function readWebp(bytes: Uint8Array): ImageHeader | null {
  if (!ascii(bytes, 8, "WEBP")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const data = 20; // chunk type (4) and size (4) at 12
  let size: { width: number; height: number } | null = null;
  if (ascii(bytes, 12, "VP8 ")) {
    // Frame tag (3), start code 9d 01 2a, then 14-bit width and height.
    if (bytes.length < data + 10) return null;
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) {
      return null;
    }
    size = {
      width: view.getUint16(data + 6, true) & 0x3fff,
      height: view.getUint16(data + 8, true) & 0x3fff,
    };
  } else if (ascii(bytes, 12, "VP8L")) {
    // Signature 0x2f, then width − 1 and height − 1 in 14 bits each.
    if (bytes.length < data + 5 || bytes[data] !== 0x2f) return null;
    const bits = view.getUint32(data + 1, true);
    size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  } else if (ascii(bytes, 12, "VP8X")) {
    // Flags (1), reserved (3), then canvas width − 1 and height − 1 in 24 bits.
    if (bytes.length < data + 10) return null;
    const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    size = { width: uint24(data + 4) + 1, height: uint24(data + 7) + 1 };
  }
  return size && { format: "webp", ...size, orientation: 1 };
}

/** The image's format and pixel size, or null for bytes it cannot read. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return readPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  if (ascii(bytes, 0, "RIFF")) return readWebp(bytes);
  return null;
}
