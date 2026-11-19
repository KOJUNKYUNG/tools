/**
 * JPEG photo info inspector: finds the JPEGs a PDF embeds (DCTDecode image
 * XObjects) straight from its bytes, and reads which segments of each are
 * photo info (CONTEXT "Photo info"). Written apart from the engine's
 * stripper (`src/lib/image/stripPhotoInfo.ts`), so the two cannot share a
 * bug.
 *
 * The scan reads raw bytes: a stream's dictionary is never inside an object
 * stream, so every image dictionary is plain text in the file. Each stream's
 * data is skipped once found, so the pictures themselves are only walked as
 * JPEGs, not searched as text.
 */

/** What a JPEG holds besides its picture, and the picture itself. */
export interface JpegReading {
  /**
   * The photo info it carries, one entry per segment ("APP1 Exif",
   * "COM", "data after the end", ...); empty when it carries none.
   */
  photoInfo: string[];
  /**
   * Its first scan, header and compressed data: no segment can sit inside
   * it, so two copies of one photo share it whatever segments were cut
   * around or between their scans, and other photos do not.
   */
  picture: Uint8Array;
}

/** A JPEG stream a PDF embeds, or why it could not be read as one. */
export type PdfJpeg =
  | { readable: true; reading: JpegReading }
  | { readable: false; detail: string };

const latin1 = new TextDecoder("latin1");
const text = (bytes: Uint8Array, from: number, to: number) =>
  latin1.decode(bytes.subarray(Math.max(0, from), Math.min(bytes.length, to)));

/** Segments a picture needs, by marker and the label its payload starts with. */
const NEEDED_APP: Readonly<Record<number, string>> = {
  0xe0: "JFIF\0",
  0xe2: "ICC_PROFILE\0",
  0xee: "Adobe",
};

/** A short name for an APPn segment: its marker and its label. */
function appName(jpeg: Uint8Array, marker: number, payload: number, end: number): string {
  const label = text(jpeg, payload, Math.min(end, payload + 16)).split("\0")[0];
  const printable = label.replace(/[^\x20-\x7e]/g, "");
  return `APP${marker - 0xe0}${printable ? ` ${printable}` : ""}`;
}

/**
 * Read `jpeg` (whole, as stored): the photo info segments before, between
 * and after its scans, and its picture. Stray bytes between segments are
 * skipped, as decoders do. Null when its marker structure cannot be walked.
 */
export function readJpegPhotoInfo(jpeg: Uint8Array): JpegReading | null {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  const photoInfo: string[] = [];
  let picture: Uint8Array | null = null;
  let i = 2;
  while (i + 1 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i = jpeg.indexOf(0xff, i);
      if (i === -1) return null;
      continue;
    }
    const marker = jpeg[i + 1];
    if (marker === 0xff) {
      i += 1;
    } else if (marker === 0xd9) {
      i += 2;
      if (picture === null) return null;
      if (i < jpeg.length) photoInfo.push("data after the end");
      return { photoInfo, picture };
    } else if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
      i += 2;
    } else {
      if (i + 3 >= jpeg.length) return null;
      const end = i + 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
      if (end > jpeg.length || end < i + 4) return null;
      if (marker === 0xfe) photoInfo.push("COM");
      if (marker >= 0xe0 && marker <= 0xef) {
        const needed = NEEDED_APP[marker];
        const label = text(jpeg, i + 4, i + 4 + (needed?.length ?? 0));
        if (needed === undefined || label !== needed) photoInfo.push(appName(jpeg, marker, i + 4, end));
      }
      const segmentStart = i;
      i = end;
      if (marker === 0xda) {
        // Entropy-coded data: skip to the next marker that is not a stuffed
        // FF 00 or a restart marker FF D0–D7.
        for (;;) {
          i = jpeg.indexOf(0xff, i);
          if (i === -1 || i + 1 >= jpeg.length) {
            i = jpeg.length;
            break;
          }
          const next = jpeg[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) i += 2;
          else if (next === 0xff) i += 1;
          else break;
        }
        picture ??= jpeg.subarray(segmentStart, i);
      }
    }
  }
  // No end-of-image marker: a truncated picture, which holds no trailer.
  return picture === null ? null : { photoInfo, picture };
}

/** Start of the next `needle` in `bytes` from `from`, or -1. */
function find(bytes: Uint8Array, needle: string, from: number): number {
  const first = needle.charCodeAt(0);
  for (let at = bytes.indexOf(first, from); at !== -1; at = bytes.indexOf(first, at + 1)) {
    let k = 1;
    while (k < needle.length && bytes[at + k] === needle.charCodeAt(k)) k++;
    if (k === needle.length) return at;
  }
  return -1;
}

/** How far before "/DCTDecode" its object header may sit. */
const DICT_WINDOW = 4096;

/**
 * Every DCTDecode image stream in `pdf`, in file order. A stream whose
 * filters chain DCTDecode with another, or whose bytes are not a readable
 * JPEG, is reported unreadable.
 */
export function pdfJpegs(pdf: Uint8Array): PdfJpeg[] {
  const found: PdfJpeg[] = [];
  let from = 0;
  for (let hit = find(pdf, "/DCTDecode", from); hit !== -1; hit = find(pdf, "/DCTDecode", from)) {
    from = hit + 1;
    const before = text(pdf, hit - DICT_WINDOW, hit);
    const header = before.lastIndexOf("obj");
    if (header === -1) continue;
    const dictStart = hit - before.length + header;
    const keyword = find(pdf, "stream", hit);
    const endobj = find(pdf, "endobj", hit);
    if (keyword === -1 || (endobj !== -1 && endobj < keyword)) continue;
    const dict = text(pdf, dictStart, keyword);
    if (!/\/Subtype\s*\/Image\b/.test(dict)) continue;

    let start = keyword + "stream".length;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    // A direct length; "/Length 12 0 R" points elsewhere, so the end is found.
    const direct = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    let end: number;
    if (direct) {
      end = start + Number(direct[1]);
    } else {
      end = find(pdf, "endstream", start);
      if (end === -1) end = pdf.length;
      while (end > start && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d)) end--;
    }
    from = Math.max(from, end);

    const filter = /\/Filter\s*(\/DCTDecode|\[([^\]]*)\])/.exec(dict);
    // "/DCTDecode" found outside the stream's /Filter: not a JPEG stream.
    if (!filter) continue;
    const chain = filter[2]?.trim().split(/\s*(?=\/)/).filter(Boolean) ?? ["/DCTDecode"];
    if (chain.length !== 1 || chain[0] !== "/DCTDecode") {
      found.push({ readable: false, detail: `filters ${chain.join(" ")}` });
      continue;
    }
    const reading = readJpegPhotoInfo(pdf.subarray(start, Math.min(end, pdf.length)));
    found.push(reading ? { readable: true, reading } : { readable: false, detail: "not a readable JPEG" });
  }
  return found;
}
