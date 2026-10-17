/**
 * Picture format sniffing: which format an embedded picture's bytes hold,
 * for the formats a binary .ppt stores (EMF, WMF, BMP, TIFF, PNG, JPEG).
 *
 * Format only, no sizes: nothing checks a metafile's or bitmap's size. Each
 * rule reads the format's fixed header fields beyond its first bytes (an
 * EMF's " EMF" signature, a WMF's header size, a BMP's DIB header size, a
 * TIFF's first IFD), so bytes that merely start like a format are not taken
 * for it. PNG, JPEG and WebP go through the image header inspector.
 */

import { type ImageHeader, readImageHeader } from "./imageHeader";

export type PictureFormat = ImageHeader["format"] | "emf" | "wmf" | "bmp" | "tiff";

/** EMR_HEADER (type 1) first, with the " EMF" signature at byte 40. */
function isEmf(view: DataView): boolean {
  return (
    view.byteLength >= 88 &&
    view.getUint32(0, true) === 1 &&
    view.getUint32(4, true) >= 88 &&
    view.getUint32(40, true) === 0x464d4520
  );
}

/** A META_HEADER at `at`: memory or disk, 9 words long, version 1 or 3. */
function isMetaHeader(view: DataView, at: number): boolean {
  if (view.byteLength < at + 18) return false;
  const type = view.getUint16(at, true);
  const version = view.getUint16(at + 4, true);
  return (
    (type === 1 || type === 2) &&
    view.getUint16(at + 2, true) === 9 &&
    (version === 0x0100 || version === 0x0300)
  );
}

/** A META_HEADER, alone or after the 22-byte placeable header (key 9AC6CDD7). */
function isWmf(view: DataView): boolean {
  const placeable = view.byteLength >= 4 && view.getUint32(0, true) === 0x9ac6cdd7;
  return isMetaHeader(view, placeable ? 22 : 0);
}

/** The DIB header sizes Windows and OS/2 define. */
const DIB_HEADER_SIZES = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

/** "BM", then a DIB header of a defined size at byte 14. */
function isBmp(view: DataView): boolean {
  return (
    view.byteLength >= 18 &&
    view.getUint16(0) === 0x424d &&
    DIB_HEADER_SIZES.has(view.getUint32(14, true))
  );
}

/** "II" or "MM", 42 in that byte order, and a first IFD inside the file. */
function isTiff(view: DataView): boolean {
  if (view.byteLength < 8) return false;
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return false;
  const littleEndian = order === 0x4949;
  const ifd = view.getUint32(4, littleEndian);
  return view.getUint16(2, littleEndian) === 42 && ifd >= 8 && ifd + 2 <= view.byteLength;
}

/** The picture's format, or null for bytes no rule recognises. */
export function readPictureFormat(bytes: Uint8Array): PictureFormat | null {
  const image = readImageHeader(bytes);
  if (image) return image.format;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (isEmf(view)) return "emf";
  if (isWmf(view)) return "wmf";
  if (isBmp(view)) return "bmp";
  if (isTiff(view)) return "tiff";
  return null;
}
