import CFB from "cfb";
import type { ExtractedImage } from "./extractImages";
import { getMime } from "./pptImageFormats";

export interface ExtractPptOptions {
  file: File;
  onProgress?: (pct: number) => void;
}

interface BlipInfo {
  ext: string;
  headerSize: number;
}

const BLIP_META: Record<number, BlipInfo> = {
  0xf01a: { ext: "emf", headerSize: 50 },
  0xf01b: { ext: "wmf", headerSize: 50 },
  0xf01d: { ext: "jpg", headerSize: 17 },
  0xf01e: { ext: "png", headerSize: 17 },
  0xf01f: { ext: "bmp", headerSize: 17 },
  0xf029: { ext: "tiff", headerSize: 17 },
};

const MAGIC_BYTES: Record<string, number[]> = {
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  bmp: [0x42, 0x4d],
  emf: [0x01, 0x00, 0x00, 0x00],
  tiff_le: [0x49, 0x49, 0x2a, 0x00],
  tiff_be: [0x4d, 0x4d, 0x00, 0x2a],
};

function matchesMagic(data: Uint8Array, offset: number, magic: number[]): boolean {
  if (offset + magic.length > data.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (data[offset + i] !== magic[i]) return false;
  }
  return true;
}

function findImageStart(data: Uint8Array, offset: number, ext: string): number {
  const searchEnd = Math.min(offset + 100, data.length);
  if (ext === "tiff") {
    for (let i = offset; i < searchEnd; i++) {
      if (matchesMagic(data, i, MAGIC_BYTES.tiff_le) || matchesMagic(data, i, MAGIC_BYTES.tiff_be)) {
        return i;
      }
    }
    return -1;
  }
  const magic = MAGIC_BYTES[ext];
  if (!magic) return -1;
  for (let i = offset; i < searchEnd; i++) {
    if (matchesMagic(data, i, magic)) return i;
  }
  return -1;
}

export function parseBlipRecords(picturesData: Uint8Array): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  let offset = 0;
  const counters: Record<string, number> = {};

  while (offset + 8 <= picturesData.length) {
    const recVerInstance =
      picturesData[offset] | (picturesData[offset + 1] << 8);
    const recType =
      picturesData[offset + 2] | (picturesData[offset + 3] << 8);
    const recLen =
      picturesData[offset + 4] |
      (picturesData[offset + 5] << 8) |
      (picturesData[offset + 6] << 16) |
      (picturesData[offset + 7] << 24);

    if (recLen <= 0 || offset + 8 + recLen > picturesData.length) break;

    const blipInfo = BLIP_META[recType];
    if (blipInfo) {
      const dataStart = offset + 8;
      const dataEnd = offset + 8 + recLen;
      const imgStart = findImageStart(picturesData, dataStart, blipInfo.ext);
      if (imgStart >= 0 && imgStart < dataEnd) {
        const imgData = picturesData.slice(imgStart, dataEnd);
        const count = (counters[blipInfo.ext] = (counters[blipInfo.ext] ?? 0) + 1);
        const name = `image_${count}.${blipInfo.ext}`;
        images.push({
          name,
          data: imgData,
          mime: getMime(blipInfo.ext),
          size: imgData.length,
        });
      }
    } else if ((recVerInstance & 0x0f) === 0x0f) {
      // subarray = zero-copy view; recursive parse only reads, never retains.
      // (Image-data slice() above still copies because the result IS retained.)
      const containerEnd = offset + 8 + recLen;
      const innerImages = parseBlipRecords(
        picturesData.subarray(offset + 8, containerEnd),
      );
      images.push(...innerImages);
    }

    offset += 8 + recLen;
  }

  return images;
}

export async function extractImagesFromPpt({
  file,
  onProgress,
}: ExtractPptOptions): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const cfb = CFB.read(new Uint8Array(arrayBuffer), { type: "array" });

  let picturesData: Uint8Array | null = null;
  for (const entry of cfb.FileIndex) {
    if (entry.name === "Pictures" && entry.content) {
      const raw = entry.content;
      picturesData = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      break;
    }
  }

  if (!picturesData || picturesData.length === 0) {
    throw new Error("NO_IMAGES");
  }

  onProgress?.(30);
  const images = await parseBlipRecordsStreaming(picturesData, onProgress);
  if (images.length === 0) {
    throw new Error("NO_IMAGES");
  }
  onProgress?.(100);
  return images;
}

/**
 * Async variant of `parseBlipRecords` that yields to the event loop every
 * `YIELD_EVERY` top-level records and reports interpolated progress in the
 * 30..100 band. Sync parsing on large (50MB+) .ppt files blocks the UI long
 * enough that the bar appears stuck at 30%.
 */
async function parseBlipRecordsStreaming(
  picturesData: Uint8Array,
  onProgress?: (pct: number) => void,
): Promise<ExtractedImage[]> {
  const YIELD_EVERY = 16;
  const images: ExtractedImage[] = [];
  let offset = 0;
  let recordsSeen = 0;
  const counters: Record<string, number> = {};
  const total = picturesData.length;

  while (offset + 8 <= picturesData.length) {
    const recVerInstance =
      picturesData[offset] | (picturesData[offset + 1] << 8);
    const recType =
      picturesData[offset + 2] | (picturesData[offset + 3] << 8);
    const recLen =
      picturesData[offset + 4] |
      (picturesData[offset + 5] << 8) |
      (picturesData[offset + 6] << 16) |
      (picturesData[offset + 7] << 24);

    if (recLen <= 0 || offset + 8 + recLen > picturesData.length) break;

    const blipInfo = BLIP_META[recType];
    if (blipInfo) {
      const dataStart = offset + 8;
      const dataEnd = offset + 8 + recLen;
      const imgStart = findImageStart(picturesData, dataStart, blipInfo.ext);
      if (imgStart >= 0 && imgStart < dataEnd) {
        const imgData = picturesData.slice(imgStart, dataEnd);
        const count = (counters[blipInfo.ext] = (counters[blipInfo.ext] ?? 0) + 1);
        images.push({
          name: `image_${count}.${blipInfo.ext}`,
          data: imgData,
          mime: getMime(blipInfo.ext),
          size: imgData.length,
        });
      }
    } else if ((recVerInstance & 0x0f) === 0x0f) {
      const containerEnd = offset + 8 + recLen;
      // Containers are parsed synchronously — they are bounded and typically
      // small. The yield cadence applies to top-level records only.
      const innerImages = parseBlipRecords(
        picturesData.subarray(offset + 8, containerEnd),
      );
      images.push(...innerImages);
    }

    offset += 8 + recLen;
    recordsSeen++;
    if (recordsSeen % YIELD_EVERY === 0) {
      const pct = 30 + Math.round((offset / total) * 70);
      onProgress?.(Math.min(99, pct));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return images;
}
