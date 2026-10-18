import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { readImageHeader, type ImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage, type PptxPackage } from "@/lib/output-check/pptxPackage";
import { sameBytes } from "@/lib/output-check/sameBytes";
import type { AssembleOptions, PlacedImage } from "./assemblePptx";

/** The bytes a base64 data URL carries (what pptxgenjs embeds as the media part). */
function dataUrlBytes(url: string): Uint8Array {
  const binary = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The background image each slide inherits: its own declared background,
 * else its layout's, else its master's. pptxgenjs writes a slide master as a
 * slide layout, so the chain is followed rather than one part assumed. A
 * part declaring a colour background does not stop the walk, so a slide that
 * overrides the image with a colour goes unnoticed (never a false positive).
 */
async function inheritedBackgrounds(pkg: PptxPackage): Promise<Map<string, string | null>> {
  const chains = await Promise.all(
    pkg.slideParts.map(async (slide) => {
      const chain = [slide];
      for (const layout of await pkg.relatedParts(slide, "slideLayout")) {
        chain.push(layout, ...(await pkg.relatedParts(layout, "slideMaster")));
      }
      return chain;
    }),
  );
  const declared = await pkg.backgroundMedia([...new Set(chains.flat())]);
  return new Map(
    chains.map((chain) => [
      chain[0],
      chain.map((part) => declared.get(part) ?? null).find((media) => media !== null) ?? null,
    ]),
  );
}

/** The header format each background extension pptxgenjs can write stands for. */
const FORMAT_OF_EXTENSION: Readonly<Record<string, ImageHeader["format"]>> = {
  png: "png",
  jpeg: "jpeg",
  jpg: "jpeg",
};

/** Why `part`'s bytes do not hold the format its extension names, or null when they do. */
function headerMismatch(part: string, bytes: Uint8Array | null): string | null {
  const expected = FORMAT_OF_EXTENSION[part.slice(part.lastIndexOf(".") + 1).toLowerCase()];
  const found = bytes && readImageHeader(bytes)?.format;
  if (found && found === expected) return null;
  return `${part}: holds ${found ?? "unreadable bytes"}`;
}

/**
 * Package overhead pptxgenjs adds besides the images: about 41 KB for an
 * empty deck plus 5 KB per slide (slide, notes and their relationships),
 * measured on pptxgenjs 4.0.1. The bound allows half again of each, plus 1%
 * of the image bytes for zip headers and deflate on compressed data.
 */
const BASE_OVERHEAD = 64 * 1024;
const SLIDE_OVERHEAD = 8 * 1024;

/**
 * image-to-pptx output properties (spec #51, confirmed in #60). ⚡ = also at
 * `quick` depth. pptxgenjs wrote the deck; the shared zip reader and package
 * inspector read it back, a second engine.
 *
 * - ⚡ package structurally valid (see pptxPackage.ts): readable zip and XML
 *   parts, well-formed XML, `[Content_Types]` coverage, relationship targets
 * - ⚡ `slide-count`: one slide per image
 * - `slide-image`: slide N shows exactly one image, the N-th image as
 *   embedded (byte-identical to the downscaled data the engine placed)
 * - `slide-background`: with an image background, every slide inherits that
 *   image (stored once, on the master pptxgenjs writes as a layout)
 * - `background-header`: the inherited background part's bytes are the
 *   format its extension names, so a JPEG is not stored as `.png` (#74)
 * - `size-bound`: output ≤ the embedded images + background + package
 *   overhead, so a background stored once per slide does not slip through
 *
 * `input` is the downscaled images in slide order and `request` the
 * assembly options: what `assemblePptxFromPlaced` was given. No input deck
 * exists, so every structural defect is the tool's doing.
 */
export const checkImageToPptx: OutputChecker<PlacedImage[], AssembleOptions, Uint8Array> =
  async (images, { background }, output, depth) => {
    const pkg = await openPptxPackage(output);
    if (!pkg) return [{ property: "zip", detail: "output is not a readable zip" }];

    const violations: Violation[] = await pkg.structuralDefects();
    if (pkg.slideParts.length !== images.length) {
      violations.push({
        property: "slide-count",
        detail: `${images.length} images → ${pkg.slideParts.length} slides`,
      });
    }
    if (depth === "quick") return violations;

    const embedded = images.map((img) => dataUrlBytes(img.dataUrl));
    const backgroundImage = background.kind === "image" ? dataUrlBytes(background.dataUrl) : null;
    const count = Math.min(images.length, pkg.slideParts.length);
    for (let i = 0; i < count; i++) {
      const slide = pkg.slideParts[i];
      const shown = await pkg.shownImages(slide);
      if (shown.length !== 1) {
        violations.push({ property: "slide-image", detail: `${slide}: shows ${shown.length} images` });
      } else if (shown[0] === null || !sameBytes(await pkg.read(shown[0]), embedded[i])) {
        violations.push({
          property: "slide-image",
          detail: `${slide}: shows ${shown[0] ?? "an external image"}, not image ${i + 1}`,
        });
      }
    }

    if (backgroundImage !== null) {
      const inherited = await inheritedBackgrounds(pkg);
      const matches = new Map<string, boolean>();
      for (const slide of pkg.slideParts) {
        const media = inherited.get(slide) ?? null;
        if (media !== null && !matches.has(media)) {
          const bytes = await pkg.read(media);
          matches.set(media, sameBytes(bytes, backgroundImage));
          const mismatch = headerMismatch(media, bytes);
          if (mismatch) violations.push({ property: "background-header", detail: mismatch });
        }
        if (media === null || !matches.get(media)) {
          violations.push({
            property: "slide-background",
            detail: `${slide}: inherits ${media ?? "no image"}`,
          });
        }
      }
    }

    const imageBytes =
      embedded.reduce((sum, b) => sum + b.byteLength, 0) + (backgroundImage?.byteLength ?? 0);
    const bound =
      imageBytes * 1.01 + BASE_OVERHEAD + SLIDE_OVERHEAD * Math.max(images.length, 1);
    if (output.byteLength > bound) {
      violations.push({
        property: "size-bound",
        detail: `${output.byteLength} > ${Math.round(bound)} bytes (images ${imageBytes})`,
      });
    }
    return violations;
  };
