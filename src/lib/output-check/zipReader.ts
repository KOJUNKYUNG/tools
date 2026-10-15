import JSZip from "jszip";

/**
 * Read-only zip access for output checkers, answering exactly as JSZip
 * would, but without JSZip's cost of loading.
 *
 * `JSZip.loadAsync` makes a pass over every byte of the file (its reader
 * normalises the whole buffer), so on a real deck most of a check's time went
 * to opening the input and output zips, media included, before a single XML
 * part was read. The fast path here reads only the central directory up
 * front and inflates a part when it is asked for, with the platform's
 * `DecompressionStream`.
 *
 * The fast path accepts only archives it reads exactly as JSZip 3.10 does
 * (names from the local header, decoded as UTF-8 and normalised by
 * `utils.resolve`; entries with no uncompressed size read as empty). Anything
 * else (zip64, prepended bytes, an encrypted or unknown-method entry, a
 * Unicode Path extra field, a name JSZip would rewrite, a duplicate, a
 * header out of bounds) goes to JSZip itself, so what a checker sees, and so
 * what it flags, does not change. A part whose deflate stream or UTF-8 the
 * platform rejects is also read by JSZip, which is more lenient (it ignores
 * pako errors and decodes with replacement).
 */
export interface ZipReader {
  /** Every file entry (directories excluded), in central-directory order. */
  names: string[];
  /** A part's bytes; null when absent or its compressed data cannot be read. */
  bytes(name: string): Promise<Uint8Array | null>;
  /** A part's UTF-8 text; null when absent or its compressed data cannot be read. */
  text(name: string): Promise<string | null>;
}

interface Entry {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  dataStart: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_SIZE = 22;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const STORE = 0;
const DEFLATE = 8;
const EXTRA_UNICODE_PATH = 0x7075;
const MADE_BY_UNIX = 3;

/** JSZip's `utils.resolve`: drops `.` and inner empty segments, applies `..`. */
function resolvePath(path: string): string {
  const parts = path.split("/");
  const result: string[] = [];
  parts.forEach((part, i) => {
    if (part === "." || (part === "" && i !== 0 && i !== parts.length - 1)) return;
    if (part === "..") result.pop();
    else result.push(part);
  });
  return result.join("/");
}

/**
 * The central directory, keyed by the name JSZip gives each file entry, or
 * null when the archive needs JSZip's own handling (or is not a zip).
 * Exported for testing.
 */
export function indexZip(bytes: Uint8Array): Map<string, Entry> | null {
  const len = bytes.byteLength;
  if (len < EOCD_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, len);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);

  // JSZip takes the last EOCD signature anywhere in the file; a valid one sits
  // in the last 22 + 65535 bytes, so if that window holds none, defer.
  let eocd = -1;
  for (let i = len - 4; i >= Math.max(0, len - EOCD_SIZE - MAX_U16); i--) {
    if (u32(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1 || eocd > len - EOCD_SIZE) return null;
  const records = u16(eocd + 10);
  const dirSize = u32(eocd + 12);
  const dirOffset = u32(eocd + 16);
  if (
    [4, 6, 8, 10].some((o) => u16(eocd + o) === MAX_U16) ||
    dirSize === MAX_U32 ||
    dirOffset === MAX_U32
  ) {
    return null; // zip64
  }
  if (eocd + EOCD_SIZE + u16(eocd + 20) > len) return null;
  if (dirOffset + dirSize !== eocd) return null; // prepended or missing bytes

  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const entries = new Map<string, Entry>();
  const seen = new Set<string>();
  let count = 0;
  let p = dirOffset;
  for (;;) {
    if (p + 4 > len) return null;
    if (u32(p) !== CENTRAL_SIG) break;
    if (p + 46 > len) return null;
    const madeBy = u16(p + 4) >> 8;
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const compressedSize = u32(p + 20);
    const uncompressedSize = u32(p + 24);
    const nameLength = u16(p + 28);
    const extraStart = p + 46 + nameLength;
    const extraEnd = extraStart + u16(p + 30);
    const externalAttrs = u32(p + 38);
    const localOffset = u32(p + 42);
    p = extraEnd + u16(p + 32);
    if (p > len) return null;

    if (flags & 0x0001) return null; // encrypted
    if (method !== STORE && method !== DEFLATE) return null;
    // JSZip reads the zip64 extra field only for a field set to this marker.
    if ([compressedSize, uncompressedSize, localOffset].includes(MAX_U32)) return null;

    // Same walk as JSZip's readExtraFields, which stops 4 bytes early.
    const extraIds = new Set<number>();
    for (let q = extraStart; q + 4 < extraEnd; ) {
      extraIds.add(u16(q));
      q += 4 + u16(q + 2);
      if (q > extraEnd) return null;
    }
    if (!(flags & 0x0800) && extraIds.has(EXTRA_UNICODE_PATH)) return null;

    // JSZip names the entry from the local header, not the central one.
    if (localOffset + 30 > len || u32(localOffset) !== LOCAL_SIG) return null;
    const localNameEnd = localOffset + 30 + u16(localOffset + 26);
    const dataStart = localNameEnd + u16(localOffset + 28);
    if (dataStart + compressedSize > len) return null;
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(localOffset + 30, localNameEnd));
    } catch {
      return null;
    }
    if (resolvePath(name) !== name) return null;

    count++;
    const dir =
      (externalAttrs & 0x0010) !== 0 ||
      (madeBy === MADE_BY_UNIX && ((externalAttrs >>> 16) & 0x4000) !== 0) ||
      name.endsWith("/");
    // JSZip keys a directory with a trailing slash and lets a repeated key
    // overwrite the earlier entry; defer on repeats rather than mimic that.
    const key = dir && !name.endsWith("/") ? `${name}/` : name;
    if (seen.has(key)) return null;
    seen.add(key);
    if (!dir) entries.set(key, { method, compressedSize, uncompressedSize, dataStart });
  }
  if (count !== records) return null;
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Blob copies the view's bytes; `as` because BlobPart wants an ArrayBuffer-backed view.
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function jszipReader(zip: JSZip): ZipReader {
  return {
    names: Object.values(zip.files)
      .filter((f) => !f.dir)
      .map((f) => f.name),
    async bytes(name) {
      const file = zip.file(name);
      return file ? file.async("uint8array").catch(() => null) : null;
    },
    async text(name) {
      const file = zip.file(name);
      return file ? file.async("text").catch(() => null) : null;
    },
  };
}

/** Opens the bytes as a zip; null when JSZip would not read them as one. */
export async function openZip(bytes: Uint8Array): Promise<ZipReader | null> {
  const entries =
    typeof DecompressionStream === "undefined" ? null : indexZip(bytes);
  if (!entries) {
    try {
      return jszipReader(await JSZip.loadAsync(bytes));
    } catch {
      return null;
    }
  }

  // The index already proved JSZip loads this archive; if it somehow does
  // not, the read throws (a checker crash, never a false defect).
  let slow: Promise<ZipReader> | null = null;
  const viaJsZip = () => (slow ??= JSZip.loadAsync(bytes).then(jszipReader));

  /** Inflated bytes, or null when the platform rejects the deflate stream. */
  const raw = async (entry: Entry): Promise<Uint8Array | null> => {
    if (entry.uncompressedSize === 0) return new Uint8Array(0);
    const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    if (entry.method === STORE) return data.slice();
    return inflateRaw(data).catch(() => null);
  };
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

  return {
    names: [...entries.keys()],
    async bytes(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      return (await raw(entry)) ?? (await viaJsZip()).bytes(name);
    },
    async text(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const data = await raw(entry);
      if (data) {
        try {
          return decoder.decode(data);
        } catch {
          // Invalid UTF-8: JSZip decodes it with replacement characters.
        }
      }
      return (await viaJsZip()).text(name);
    },
  };
}
