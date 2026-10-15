/**
 * Image header inspector: reads an image's format and pixel size straight
 * from its bytes, without decoding it, so image checks run in Node as in the
 * browser. Covers PNG and JPEG; WebP joins with pdf-to-image's check (#64).
 *
 * Sizes are the stored pixel grid. A JPEG's EXIF orientation, which browsers
 * apply when showing it, is reported separately (written independently of the
 * PDF engine's reader, so the two cannot share a bug).
 */
export interface ImageHeader {
  format: "png" | "jpeg";
  width: number;
  height: number;
  /** EXIF Orientation, 1–8; 1 (upright) when absent. 5–8 show it turned a quarter. */
  orientation: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(bytes: Uint8Array): ImageHeader | null {
  // Signature, then the IHDR chunk: length (4), type (4), width, height.
  if (bytes.length < 24) return null;
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
 * at `start` ("Exif" and two zero bytes, then a TIFF header) and ends at `end`; 1 otherwise.
 */
function exifOrientation(view: DataView, start: number, end: number): number {
  if (end > view.byteLength || end - start < 14) return 1;
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 1;
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

function readJpeg(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
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
    if (at + 4 > bytes.length) return null;
    if (isFrameMarker(marker)) {
      // Length (2), precision (1), height (2), width (2).
      if (at + 9 > bytes.length) return null;
      const height = view.getUint16(at + 5);
      return { format: "jpeg", width: view.getUint16(at + 7), height, orientation };
    }
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && orientation === 1) {
      orientation = exifOrientation(view, at + 4, at + 2 + length);
    }
    at += 2 + length;
  }
  return null;
}

/** The image's format and pixel size, or null for bytes it cannot read. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return readPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  return null;
}
