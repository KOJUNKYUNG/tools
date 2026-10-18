import { browserDecodes } from "@/lib/output-check/browserDecode";
import type { OutputChecker, Violation } from "@/lib/output-check/core";
import {
  displayedSize,
  hasUnreadOrientation,
  HEADER_FORMAT_OF_MIME,
  readImageHeader,
  type ImageHeader,
} from "@/lib/output-check/imageHeader";
import { notSmaller, SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { indexZip } from "@/lib/output-check/zipReader";
import type { OutputFormat } from "./compressImage";

export interface CompressedImageRequest {
  /** The output format the user picked. */
  format: OutputFormat;
  /**
   * Whether the output keeps the input's format (a compression). A HEIC
   * input reaches the engine as JPEG, but turning it into JPEG is a
   * conversion the user asked for, so it is not same-format.
   */
  sameFormat: boolean;
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/** The property a canvas's PNG fallback violates; the engine words it for the user. */
export const IMAGE_FORMAT = "image-format";

/** Whether a header is in the format `format` asks for. */
export const isFormat = (header: ImageHeader | null, format: OutputFormat) =>
  header?.format === HEADER_FORMAT_OF_MIME[format];

/**
 * image-compress output properties for one image (spec #51, confirmed in
 * #60), all ⚡ (`quick`):
 *
 * - `image-header`: the output's header can be read at all
 * - `image-format`: its header is the requested format. A canvas that cannot
 *   encode the requested type writes PNG instead (Safari and WebP), which
 *   this catches. Kept apart from `image-header` so the tool can tell the
 *   user to pick another format
 * - `image-size`: its size as displayed equals the input's (canvases draw a
 *   phone photo turned upright). Skipped when the input's header is
 *   unreadable, or when it carries orientation metadata the header reader
 *   does not read (WebP EXIF, PNG eXIf): there is nothing certain to compare
 *   against
 * - `image-decodes`: the browser decodes it
 * - `size-bound`: a same-format output is strictly smaller than its input.
 *   The engine settles this before checking (a file that did not shrink is
 *   not offered), so at run time it never blocks
 */
export const checkCompressedImage: OutputChecker<Blob, CompressedImageRequest, Blob> = async (
  input,
  { format, sameFormat },
  output,
) => {
  const violations: Violation[] = [];
  const header = readImageHeader(await bytesOf(output));
  if (!header) {
    violations.push({ property: "image-header", detail: "the output's header cannot be read" });
  } else {
    if (!isFormat(header, format)) {
      violations.push({
        property: IMAGE_FORMAT,
        detail: `expected ${HEADER_FORMAT_OF_MIME[format]}, got ${header.format}`,
      });
    }
    const inputBytes = await bytesOf(input);
    const source = hasUnreadOrientation(inputBytes) ? null : readImageHeader(inputBytes);
    if (source) {
      const [w, h] = displayedSize(source);
      const [ow, oh] = displayedSize(header);
      if (ow !== w || oh !== h) {
        violations.push({ property: "image-size", detail: `${ow}×${oh}, input ${w}×${h}` });
      }
    }
  }
  if (!(await browserDecodes(output))) {
    violations.push({ property: "image-decodes", detail: "the browser cannot decode it" });
  }
  if (sameFormat && notSmaller(input, output)) {
    violations.push({ property: SIZE_BOUND, detail: `${output.size} ≥ ${input.size} bytes` });
  }
  return violations;
};

/**
 * image-compress batch zip property, ⚡: `zip-entry-count`, one entry per
 * input file (two inputs sharing a name must not overwrite each other).
 * Input = the number of input files.
 */
export const checkCompressZip: OutputChecker<number, void, Uint8Array> = async (
  inputCount,
  _request,
  zip,
) => {
  const entries = indexZip(zip);
  const count = entries ? [...entries.keys()].filter((name) => !name.endsWith("/")).length : 0;
  return count === inputCount
    ? []
    : [{ property: "zip-entry-count", detail: `${count} entries, ${inputCount} inputs` }];
};
