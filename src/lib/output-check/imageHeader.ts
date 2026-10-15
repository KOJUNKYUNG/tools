/**
 * Image header inspector: reads an image's format and pixel size straight
 * from its bytes, without decoding it, so image checks run in Node as in the
 * browser. Covers PNG and JPEG; WebP joins with pdf-to-image's check (#64).
 *
 * Sizes are the stored pixel grid: a JPEG's EXIF orientation is not applied.
 */
export interface ImageHeader {
  format: "png" | "jpeg";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(bytes: Uint8Array): ImageHeader | null {
  // Signature, then the IHDR chunk: length (4), type (4), width, height.
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

/** Start-of-frame markers (C0–CF except DHT C4, JPG C8, DAC CC) carry the size. */
const isFrameMarker = (m: number) =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** Markers that stand alone, without a length field. */
const isStandalone = (m: number) => (m >= 0xd0 && m <= 0xd9) || m === 0x01;

function readJpeg(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
      return { format: "jpeg", height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}

/** The image's format and pixel size, or null for bytes it cannot read. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return readPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  return null;
}
