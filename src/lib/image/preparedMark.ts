/**
 * The mark on a PNG whose format the site settled for a slide (one the slide
 * image preparer encoded, or a solid colour saved from a result): a private
 * ancillary chunk after IHDR, which decoders skip, so the pixels are
 * untouched. Re-uploaded whole (a background saved from a result, a picture
 * taken out of a deck), it goes back in as is.
 * Without the mark, the format rule would measure it again, and another
 * browser's encoder could turn it into JPEG: a quality change on re-use.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Ancillary, private, reserved bit clear, safe to copy (PNG 1.2 §3.3). */
const TYPE = "onTb";
const DATA = "ontab prepared";
/** Where IHDR ends: signature (8) + length, type, 13 data bytes, CRC (25). */
const AFTER_IHDR = 33;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const typeAt = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** Whether `bytes` start with a PNG signature and an IHDR chunk. */
function startsPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= AFTER_IHDR &&
    SIGNATURE.every((b, i) => bytes[i] === b) &&
    typeAt(bytes, 12) === "IHDR" &&
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(8) === 13
  );
}

/** The PNG with the mark after its IHDR; anything that is not a PNG, unchanged. */
export function markPrepared(png: Uint8Array): Uint8Array {
  if (!startsPng(png) || isMarkedPrepared(png)) return png;
  const typeAndData = new Uint8Array([...ascii(TYPE), ...ascii(DATA)]);
  const chunk = new Uint8Array(12 + DATA.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, DATA.length);
  chunk.set(typeAndData, 4);
  view.setUint32(8 + DATA.length, crc32(typeAndData));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, AFTER_IHDR));
  out.set(chunk, AFTER_IHDR);
  out.set(png.subarray(AFTER_IHDR), AFTER_IHDR + chunk.length);
  return out;
}

/** Whether the PNG carries the mark right after its IHDR, where `markPrepared` puts it. */
export function isMarkedPrepared(bytes: Uint8Array): boolean {
  return startsPng(bytes) && bytes.length >= AFTER_IHDR + 8 && typeAt(bytes, AFTER_IHDR + 4) === TYPE;
}
