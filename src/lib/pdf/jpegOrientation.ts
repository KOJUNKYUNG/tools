// EXIF orientation for JPEG pages. Browsers show a JPEG turned as its EXIF
// Orientation tag says (the editor's thumbnails do), but a PDF shows the
// stored pixels as they are. pdf-lib embeds the JPEG unchanged, so the engine
// applies the orientation itself when drawing, keeping the original bytes.
// PNG is treated as upright: its rare eXIf chunk is not read.

/** EXIF Orientation: 1 = upright; 2–8 = mirrored and/or turned (TIFF 6.0). */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** A PDF transformation matrix [a b c d e f]. */
export type Matrix = [number, number, number, number, number, number];

const isExifOrientation = (value: number): value is ExifOrientation =>
  Number.isInteger(value) && value >= 1 && value <= 8;

const APP1 = 0xe1;
const SOS = 0xda;
const ORIENTATION_TAG = 0x0112;

/**
 * The Orientation in a JPEG's first EXIF segment (the one browsers follow),
 * searched up to the image data; 1 when absent or unreadable.
 */
export function readJpegOrientation(bytes: Uint8Array): ExifOrientation {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 1 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === SOS) return 1; // image data follows: no EXIF found
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
      at += 2; // stand-alone marker, no length field
      continue;
    }
    if (at + 4 > bytes.length) return 1;
    const length = view.getUint16(at + 2);
    if (marker === APP1 && isExifHeader(bytes, at + 4)) {
      return orientationInTiff(view, at + 10, at + 2 + length);
    }
    at += 2 + length;
  }
  return 1;
}

function isExifHeader(bytes: Uint8Array, at: number): boolean {
  const header = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"
  return header.every((b, i) => bytes[at + i] === b);
}

/** Read IFD0's Orientation from the TIFF structure at `tiff` (ends at `end`). */
function orientationInTiff(view: DataView, tiff: number, end: number): ExifOrientation {
  if (end > view.byteLength || tiff + 8 > end) return 1;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return 1; // "II" or "MM"
  const le = order === 0x4949;
  const ifd = tiff + view.getUint32(tiff + 4, le);
  if (ifd + 2 > end) return 1;
  const entries = view.getUint16(ifd, le);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (view.getUint16(entry, le) !== ORIENTATION_TAG) continue;
    const value = view.getUint16(entry + 8, le);
    return isExifOrientation(value) ? value : 1;
  }
  return 1;
}

/** The displayed size of a `width`×`height` stored image: 5–8 swap the sides. */
export function orientedSize(
  width: number,
  height: number,
  orientation: ExifOrientation,
): [number, number] {
  return orientation >= 5 ? [height, width] : [width, height];
}

/**
 * The PDF transformation matrix [a b c d e f] that draws the stored image so
 * it appears upright in a `width`×`height` box (the displayed size) at the
 * origin. Image space has u to the right and v up, the stored top row at
 * v = 1; each matrix maps the stored corners to where the orientation says
 * they are seen. Orientation 1 is pdf-lib's own scale(width, height).
 */
export function orientationMatrix(
  orientation: ExifOrientation,
  width: number,
  height: number,
): Matrix {
  const w = width;
  const h = height;
  switch (orientation) {
    case 1: return [w, 0, 0, h, 0, 0];
    case 2: return [-w, 0, 0, h, w, 0]; // mirrored left-right
    case 3: return [-w, 0, 0, -h, w, h]; // turned 180°
    case 4: return [w, 0, 0, -h, 0, h]; // mirrored top-bottom
    case 5: return [0, -h, -w, 0, w, h]; // mirrored along the main diagonal
    case 6: return [0, -h, w, 0, 0, h]; // shown turned 90° clockwise
    case 7: return [0, h, w, 0, 0, 0]; // mirrored along the anti-diagonal
    case 8: return [0, h, -w, 0, w, 0]; // shown turned 90° counterclockwise
  }
}
