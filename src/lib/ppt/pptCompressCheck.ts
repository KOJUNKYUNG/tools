import { notInherited, type OutputChecker, type Violation } from "@/lib/output-check/core";
import { readImageHeader, type ImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage } from "@/lib/output-check/pptxPackage";
import { notSmaller, SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { getExt } from "./pptImageFormats";
import { RECOMPRESSIBLE_EXTS, type CompressionPreset } from "./pptCompressPlan";

export interface PptCompressRequest {
  preset: CompressionPreset;
}

const HEADER_FORMAT_OF_EXT: Readonly<Record<string, ImageHeader["format"]>> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
};

const isRecompressibleMedia = (part: string) =>
  /^ppt\/media\/[^/]+$/.test(part) && RECOMPRESSIBLE_EXTS.has(getExt(part));

/**
 * What is wrong with `recompressed`, the new bytes of the media part `part`
 * whose input bytes were `original`. Shared by the checker and the engine,
 * which keeps an image's original bytes instead of a candidate that fails.
 */
export function recompressedMediaViolations(
  part: string,
  original: Uint8Array,
  recompressed: Uint8Array,
): Violation[] {
  const header = readImageHeader(recompressed);
  const expected = HEADER_FORMAT_OF_EXT[getExt(part)];
  if (header === null || header.format !== expected) {
    return [
      {
        property: "media-header",
        detail: `${part}: ${header?.format ?? "unreadable"}, expected ${expected}`,
      },
    ];
  }
  // An input image the header reader cannot size has nothing to compare to.
  const source = readImageHeader(original);
  if (source === null) return [];
  const [w, h] = displayedSize(source);
  const [ow, oh] = displayedSize(header);
  if (w !== ow || h !== oh) {
    return [{ property: "media-dimensions", detail: `${part}: ${w}×${h} → ${ow}×${oh}` }];
  }
  return [];
}

/** Width and height as shown: EXIF orientations 5–8 turn the image a quarter. */
function displayedSize({ width, height, orientation }: ImageHeader): [number, number] {
  return orientation >= 5 ? [height, width] : [width, height];
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * ppt-compress output properties (spec #51, confirmed in #60), all ⚡ (`quick`
 * and `full` check the same). JSZip wrote the output; the shared zip reader
 * and header inspector read it back.
 *
 * - `size-bound`: the output is strictly smaller than the input. An outcome,
 *   not damage: the engine turns it into a "could not shrink" result
 * - package structurally valid (see pptxPackage.ts): readable zip and XML
 *   parts, well-formed XML, `[Content_Types]` coverage, relationship targets
 * - `entry-set`: exactly the input's parts, none added, dropped or renamed
 * - `slide-count`: the input's number of slides
 * - `media-header`: every recompressed jpg/jpeg/png holds that format
 * - `media-dimensions`: every recompressed image keeps its size as displayed
 *   (EXIF orientation applied): slide frames are fixed, so a new size or
 *   orientation distorts the slide. The engine keeps an image's original
 *   bytes rather than a candidate that fails either media property
 *
 * A media part counts as recompressed when its bytes differ from the input's.
 * Structural defects the input already had are not the tool's doing.
 */
export const checkPptCompress: OutputChecker<Uint8Array, PptCompressRequest, Uint8Array> =
  async (input, _request, output) => {
    const violations: Violation[] = [];
    if (notSmaller(input, output)) {
      violations.push({
        property: SIZE_BOUND,
        detail: `${input.byteLength} → ${output.byteLength} bytes`,
      });
    }

    const [before, after] = await Promise.all([
      openPptxPackage(input),
      openPptxPackage(output),
    ]);
    if (!after) return [...violations, { property: "zip", detail: "output is not a readable zip" }];
    if (!before) return violations;

    const defects = await after.structuralDefects(before);
    if (defects.length > 0) {
      violations.push(...notInherited(defects, await before.structuralDefects()));
    }

    const kept = new Set(after.parts);
    const missing = before.parts.filter((p) => !kept.has(p));
    if (missing.length > 0 || after.parts.length !== before.parts.length) {
      violations.push({
        property: "entry-set",
        detail: `${before.parts.length} → ${after.parts.length} parts; missing ${missing.join(", ") || "none"}`,
      });
    }
    if (before.slideParts.length !== after.slideParts.length) {
      violations.push({
        property: "slide-count",
        detail: `${before.slideParts.length} → ${after.slideParts.length}`,
      });
    }

    const had = new Set(before.parts);
    for (const part of after.parts) {
      if (!isRecompressibleMedia(part) || !had.has(part) || after.storedAsIn(before, part)) continue;
      const [original, recompressed] = await Promise.all([before.read(part), after.read(part)]);
      // An unreadable part is the zip's damage, not a recompressed image.
      if (original === null || recompressed === null) continue;
      if (sameBytes(original, recompressed)) continue;
      violations.push(...recompressedMediaViolations(part, original, recompressed));
    }
    return violations;
  };
