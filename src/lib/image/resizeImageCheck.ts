import { browserDecodes } from "@/lib/output-check/browserDecode";
import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { HEADER_FORMAT_OF_MIME, readImageHeader } from "@/lib/output-check/imageHeader";

export interface ImageResizeRequest {
  /** The canvas size the engine computed (percent and aspect lock resolved). */
  width: number;
  height: number;
  /**
   * The MIME type the engine asked the canvas to encode: the input's own,
   * as no caller sets an output format.
   */
  format: string;
}

const KiB = 1024;

/**
 * The size bound, for a downscale: a re-encode of fewer pixels may still
 * come out larger than a tightly compressed input (a low-quality JPEG
 * re-encoded at 92%, an optimised PNG whose flat colours smoothing blurs),
 * but not by several times.
 */
const sizeBound = (input: Blob) => input.size * 3 + 64 * KiB;

/**
 * The input's pixel count. Throws when unreadable: the engine just drew it.
 * A crop draws only part of the input, but the bound is loose enough to
 * compare against the whole.
 */
async function inputPixels(input: Blob): Promise<number> {
  const header = readImageHeader(new Uint8Array(await input.arrayBuffer()));
  if (!header) throw new Error("cannot read the input image's header");
  // An EXIF quarter turn swaps the sides, not the pixel count.
  return header.width * header.height;
}

/**
 * image-resize output properties (spec #51, confirmed in #60). ⚡ = also at
 * `quick`.
 *
 * - ⚡ `image-decodes`: the browser decodes the output
 * - ⚡ `image-size`: its header size is exactly the size the engine computed:
 *   the canvas is made that size, so no rounding is left to allow for
 * - ⚡ `image-format`: its header is the input's format (a HEIC input reaches
 *   the engine already converted to JPEG). A canvas that cannot encode the
 *   requested type writes PNG instead, which this catches
 * - `size-bound`: when downscaling, the output is not far above the input
 */
export const checkImageResize: OutputChecker<Blob, ImageResizeRequest, Blob> = async (
  input,
  { width, height, format },
  output,
  depth,
) => {
  const violations: Violation[] = [];
  const header = readImageHeader(new Uint8Array(await output.arrayBuffer()));
  const expected = HEADER_FORMAT_OF_MIME[format];
  const got = header?.format ?? "unreadable bytes";
  if (expected) {
    if (header?.format !== expected) {
      violations.push({ property: "image-format", detail: `expected ${expected}, got ${got}` });
    }
  } else if (header) {
    // A type the header reader does not know: bytes it does know (the
    // canvas's PNG fallback) are certainly not that type.
    violations.push({ property: "image-format", detail: `expected ${format}, got ${got}` });
  }
  if (header && (header.width !== width || header.height !== height)) {
    violations.push({
      property: "image-size",
      detail: `${header.width}×${header.height}, computed ${width}×${height}`,
    });
  }
  if (!(await browserDecodes(output))) {
    violations.push({ property: "image-decodes", detail: "the browser cannot decode it" });
  }

  if (depth === "full" && width * height < (await inputPixels(input))) {
    const bound = sizeBound(input);
    if (output.size > bound) {
      violations.push({ property: "size-bound", detail: `${output.size} > ${bound} bytes` });
    }
  }
  return violations;
};
