// Test-only stand-in for the browser slide image preparer (never imported by the app).
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { pngAlphaUsed } from "@/lib/output-check/pngAlpha";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import type { CropRect } from "./maxFitCrop";
import {
  fittedSize,
  preparedFormat,
  takenWhole,
  type PixelSize,
  type PreparedImage,
  type PrepareSlideImage,
  type SizedImagePreparation,
} from "./slideImage";

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * An image whose header reads as `format` at `size` but which holds no pixels,
 * tagged so that different sources give different bytes. Header readers and
 * byte comparisons accept it; a decoder would not.
 */
export function headerOnlyImage(format: "png" | "jpeg", size: PixelSize, tag: Uint8Array): Uint8Array {
  if (format === "png") {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size.width, 0);
    ihdr.writeUInt32BE(size.height, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
    return Uint8Array.from(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("tsTg", tag), // private, ancillary
        pngChunk("IEND", new Uint8Array(0)),
      ]),
    );
  }
  const segment = (marker: number, data: Uint8Array) => {
    const out = Buffer.alloc(4 + data.length);
    out.set([0xff, marker], 0);
    out.writeUInt16BE(2 + data.length, 2);
    out.set(data, 4);
    return out;
  };
  const frame = Buffer.alloc(15);
  frame[0] = 8; // precision
  frame.writeUInt16BE(size.height, 1);
  frame.writeUInt16BE(size.width, 3);
  frame.set([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 5);
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      segment(0xfe, tag), // comment
      segment(0xc0, frame),
      Buffer.from([0xff, 0xd9]),
    ]),
  );
}

/** Encoded sizes the stand-in assumes for every picture: a photo's, JPEG a tenth of PNG. */
const PHOTO_ENCODED = { jpegBytes: 1, pngBytes: 10 };

/**
 * Stands in for `prepareSlideImage` in Node: the real sizing and format
 * decisions, a header-only image at that size. With no encoder to measure,
 * every picture is sized as a photo (its JPEG a tenth of its PNG), so opaque
 * pictures come out JPEG and pictures whose alpha is used stay PNG.
 */
export const standInPrepare: PrepareSlideImage = async (source, crop, slide) => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  return encodedStandIn(bytes, crop, fittedSize(crop, slide), await photoFormat(bytes));
};

/** The format the stand-in's sizes give a picture: PNG only when its alpha is used. */
async function photoFormat(bytes: Uint8Array): Promise<PreparedImage["format"]> {
  const alphaUsed = (await pngAlphaUsed(bytes)) === true;
  return preparedFormat({ alphaUsed, ...PHOTO_ENCODED });
}

/** The picture a canvas would encode: tagged with its source, cut and any step. */
function encodedStandIn(
  bytes: Uint8Array,
  crop: CropRect,
  size: PixelSize,
  format: PreparedImage["format"],
  stepped?: "stepped",
): PreparedImage {
  const tag = createHash("sha256").update(bytes).update(JSON.stringify(crop)).update(stepped ?? "").digest();
  return { bytes: headerOnlyImage(format, size, tag), format, ...size };
}

/**
 * Stands in for `sizedImagePreparation` in Node: the size from the header, the
 * real rule for what goes in as uploaded, and otherwise a header-only image,
 * sized as a photo as `standInPrepare` is. A step is handed a stand-in canvas
 * of the fitted size, and its picture is always encoded. So an opaque PNG taken whole comes
 * out JPEG here; the preparer's own tests cover one JPEG would not halve.
 */
export const standInSizedPreparation: SizedImagePreparation = {
  async measure(source) {
    const header = readImageHeader(new Uint8Array(await source.arrayBuffer()));
    if (!header) throw new Error("cannot read the image header");
    const [width, height] = displayedSize(header);
    return { width, height };
  },
  async prepare(source, crop, size, step) {
    const bytes = new Uint8Array(await source.arrayBuffer());
    const format = await photoFormat(bytes);
    if (step) {
      // The step changes the pixels, so its picture is always encoded, as the preparer's is.
      // A stand-in canvas of the fitted size: Node has no OffscreenCanvas, and the steps tests pass read only its size.
      await step({ width: size.width, height: size.height } as OffscreenCanvas);
      return encodedStandIn(bytes, crop, size, format, "stepped");
    }
    if (takenWhole(bytes, crop, size) && readImageHeader(bytes)?.format === format) {
      return { bytes, format, ...size };
    }
    return encodedStandIn(bytes, crop, size, format);
  },
};
