// Detects soft masks (/SMask images) whose colour space is not DeviceGray.
//
// ISO 32000-1 §11.6.5.3 requires a soft-mask image to be DeviceGray. The
// upstream compressor (justpdf-compress-wasm 0.1.2/0.1.3, see upstream #46)
// re-encodes some soft masks as RGB JPEGs when image re-encoding is on
// (Medium/Heavy). Viewers then disagree: PDFium (Chrome) tolerates it, while
// pdf.js (our preview, Firefox) drops the masked image — e.g. a deck's
// translucent background blobs vanish. The caller re-compresses without image
// re-encoding when this returns true.
//
// The scan works on raw bytes, chunked, so a large output never has to become
// one huge string. Stream dictionaries are never inside object streams, so the
// image dictionaries and their /SMask references are always plain text.

const DEFAULT_CHUNK = 4 * 1024 * 1024;
/** Longer than any match below, so matches straddling a chunk edge are seen whole. */
const OVERLAP = 256;
/** How far past an object header to look for its dictionary. */
const DICT_WINDOW = 4096;

const SMASK_REF = /\/SMask\s{1,10}(\d{1,10})\s{1,10}(\d{1,5})\s{1,10}R/g;
const OBJ_HEADER = /(?<!\d)(\d{1,10})\s{1,10}(\d{1,5})\s{1,10}obj\b/g;
const COLOR_SPACE = /\/ColorSpace\s*\/([A-Za-z0-9]+)/;

// windows-1252 maps every byte to exactly one UTF-16 unit, so string indices
// equal byte offsets.
const decoder = new TextDecoder("latin1");

function* scan(bytes: Uint8Array, re: RegExp, chunk: number) {
  for (let start = 0; start < bytes.length; start += chunk) {
    // Include a leading overlap so a lookbehind sees the bytes before `start`;
    // a match is owned by the chunk its first byte falls in.
    const from = Math.max(0, start - OVERLAP);
    const text = decoder.decode(bytes.subarray(from, Math.min(bytes.length, start + chunk + OVERLAP)));
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const index = from + m.index;
      if (index >= start + chunk) break;
      if (index >= start) yield { index, match: m };
    }
  }
}

/** The object's dictionary text: from its header up to `stream` or `endobj`. */
function dictAfter(bytes: Uint8Array, from: number): string {
  const text = decoder.decode(bytes.subarray(from, Math.min(bytes.length, from + DICT_WINDOW)));
  const ends = [text.indexOf("stream"), text.indexOf("endobj")].filter((i) => i !== -1);
  return ends.length > 0 ? text.slice(0, Math.min(...ends)) : text;
}

/**
 * True if any image referenced as an /SMask declares a colour space other than
 * DeviceGray. Masks without a direct /ColorSpace name (absent, or an indirect
 * reference) are not flagged — this targets the known defect, not every
 * conceivable malformation.
 *
 * @param chunk Scan window size in bytes; exposed for boundary tests.
 */
export function hasInvalidSoftMask(bytes: Uint8Array, chunk = DEFAULT_CHUNK): boolean {
  const masks = new Set<string>();
  for (const { match } of scan(bytes, SMASK_REF, chunk)) masks.add(`${match[1]} ${match[2]}`);
  if (masks.size === 0) return false;

  for (const { index, match } of scan(bytes, OBJ_HEADER, chunk)) {
    if (!masks.has(`${match[1]} ${match[2]}`)) continue;
    const colorSpace = COLOR_SPACE.exec(dictAfter(bytes, index + match[0].length));
    if (colorSpace && colorSpace[1] !== "DeviceGray") return true;
  }
  return false;
}
