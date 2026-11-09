import { filledSize, type PixelSize } from "@/lib/image/slideImage";
import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { displayedSize, readImageHeader, type ImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage, type PptxPackage } from "@/lib/output-check/pptxPackage";
import { sameBytes } from "@/lib/output-check/sameBytes";
import type { AssembleOptions, PlacedImage } from "./assemblePptx";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";

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

/** The header format each picture extension pptxgenjs can write stands for. */
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

/** A picture's size as it shows, or null for unreadable bytes, which the header properties report. */
function shownSize(bytes: Uint8Array | null): [number, number] | null {
  const header = bytes && readImageHeader(bytes);
  return header ? displayedSize(header) : null;
}

/** Why `part`'s picture holds more pixels than `slideOnScreen` shows, or null when it does not. */
function overScreen(part: string, bytes: Uint8Array | null, slideOnScreen: PixelSize): string | null {
  const shown = shownSize(bytes);
  if (!shown) return null;
  const [width, height] = shown;
  if (width <= slideOnScreen.width && height <= slideOnScreen.height) return null;
  return `${part}: ${width} × ${height} on a ${slideOnScreen.width} × ${slideOnScreen.height} slide`;
}

/**
 * Why `part`'s picture is not of the slide's aspect, or null when it is: the
 * Background crop's tolerance, 1 px on each side for rounding, so a picture
 * stretched to the slide is caught.
 */
function offAspect(part: string, bytes: Uint8Array | null, slideKind: SlideKind): string | null {
  const shown = shownSize(bytes);
  if (!shown) return null;
  const [width, height] = shown;
  const { w, h } = SLIDE_SIZES[slideKind];
  if (Math.abs(width - (height * w) / h) <= 1 && Math.abs(height - (width * h) / w) <= 1) return null;
  return `${part}: ${width} × ${height} on a ${slideKind} slide`;
}

/** A rectangle in EMU, as `<a:off>` and `<a:ext>` hold it. */
interface Frame { x: number; y: number; w: number; h: number; }

/** EMU a frame may pass the slide's edge by: pptxgenjs rounds its offset and extent apart. */
const EDGE_EMU = 2;

/** The deck's `<p:sldSz>` in EMU, or null when absent or unreadable. */
async function slideSizeEmu(pkg: PptxPackage): Promise<{ w: number; h: number } | null> {
  const tag = (await pkg.text("ppt/presentation.xml"))?.match(/<p:sldSz\b[^>]*>/)?.[0] ?? "";
  const attr = (name: string) => Number(tag.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  const w = attr("cx");
  const h = attr("cy");
  return w > 0 && h > 0 ? { w, h } : null;
}

/** The frame of the slide's (only) picture, or null when it has none readable. */
async function pictureFrame(pkg: PptxPackage, slide: string): Promise<Frame | null> {
  const pic = (await pkg.text(slide))?.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] ?? "";
  const off = pic.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
  const ext = pic.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
  if (!off || !ext) return null;
  return { x: Number(off[1]), y: Number(off[2]), w: Number(ext[1]), h: Number(ext[2]) };
}

/**
 * Why `frame` reaches past the slide, or null when it lies within it. Read
 * from the deck's own XML in EMU rather than through the engine's
 * `reachesPastSlide`, so the check stays a second, independent reading.
 */
function pastSlide(slide: string, frame: Frame, size: { w: number; h: number }): string | null {
  const within =
    frame.x >= -EDGE_EMU &&
    frame.y >= -EDGE_EMU &&
    frame.x + frame.w <= size.w + EDGE_EMU &&
    frame.y + frame.h <= size.h + EDGE_EMU;
  if (within) return null;
  return `${slide}: picture at ${frame.x}, ${frame.y}, ${frame.w} × ${frame.h} EMU on a ${size.w} × ${size.h} slide`;
}

/**
 * Why a cut picture holds more pixels than its frame shows on the slide's
 * rectangle on the screen, or null when it does not: a pixel's rounding allowed.
 */
function overShown(part: string, bytes: Uint8Array | null, frame: Frame, size: { w: number; h: number }, slideOnScreen: PixelSize): string | null {
  const shown = shownSize(bytes);
  if (!shown) return null;
  const [width, height] = shown;
  const frameW = (frame.w / size.w) * slideOnScreen.width;
  const frameH = (frame.h / size.h) * slideOnScreen.height;
  if (width <= frameW + 1 && height <= frameH + 1) return null;
  return `${part}: ${width} × ${height} shown on ${Math.round(frameW)} × ${Math.round(frameH)}`;
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
 *   embedded (byte-identical to the prepared data the engine placed), or
 *   none when that picture lay wholly off the slide
 * - `slide-bounds`: every slide picture lies within the slide, since what
 *   reaches past it is cut off when the deck is made (CONTEXT "Placement")
 * - `cut-size`: a picture cut at the slide's edge holds no more pixels than
 *   its rectangle shows on the slide's rectangle on the deck's screen
 * - `slide-image-header`: each slide picture's bytes are the format its
 *   part's extension names, since formats mix within a deck
 * - `screen-size`: no embedded picture, background included, holds more
 *   pixels, on either side, than the slide's rectangle on the deck's screen
 *   size
 * - `slide-background`: with an image background, every slide inherits that
 *   image (stored once, on the master pptxgenjs writes as a layout)
 * - `background-header`: the inherited background part's bytes are the
 *   format its extension names, so a JPEG is not stored as `.png` (#74)
 * - `background-aspect`: the inherited background picture has the slide's
 *   aspect within a pixel's rounding, so it is cropped, not stretched
 * - `size-bound`: output ≤ the embedded images + background + package
 *   overhead, so a background stored once per slide does not slip through
 *
 * `input` is the prepared images in slide order and `request` the assembly
 * options: what `assemblePptxFromPlaced` was given. No input deck
 * exists, so every structural defect is the tool's doing.
 */
export const checkImageToPptx: OutputChecker<PlacedImage[], AssembleOptions, Uint8Array> =
  async (images, { background, slideKind, screen }, output, depth) => {
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

    const embedded = images.map((img) => (img.dataUrl === null ? null : dataUrlBytes(img.dataUrl)));
    const backgroundImage = background.kind === "image" ? dataUrlBytes(background.dataUrl) : null;
    const count = Math.min(images.length, pkg.slideParts.length);
    const slideOnScreen = filledSize(SLIDE_SIZES[slideKind], screen);
    const slideEmu = await slideSizeEmu(pkg);
    for (let i = 0; i < count; i++) {
      const slide = pkg.slideParts[i];
      const shown = await pkg.shownImages(slide);
      const expected = embedded[i];
      if (expected === null) {
        // Its picture lay wholly off the slide: the background alone shows.
        if (shown.length !== 0) {
          violations.push({ property: "slide-image", detail: `${slide}: shows ${shown.length} images, none expected` });
        }
        continue;
      }
      if (shown.length !== 1) {
        violations.push({ property: "slide-image", detail: `${slide}: shows ${shown.length} images` });
        continue;
      }
      const part = shown[0];
      const bytes = part === null ? null : await pkg.read(part);
      if (part === null || !sameBytes(bytes, expected)) {
        violations.push({
          property: "slide-image",
          detail: `${slide}: shows ${part ?? "an external image"}, not image ${i + 1}`,
        });
      }
      if (part === null) continue;
      const mismatch = headerMismatch(part, bytes);
      if (mismatch) violations.push({ property: "slide-image-header", detail: mismatch });
      const over = overScreen(part, bytes, slideOnScreen);
      if (over) violations.push({ property: "screen-size", detail: over });
      const frame = await pictureFrame(pkg, slide);
      if (frame && slideEmu) {
        const past = pastSlide(slide, frame, slideEmu);
        if (past) violations.push({ property: "slide-bounds", detail: past });
        const overCut = images[i].cut ? overShown(part, bytes, frame, slideEmu, slideOnScreen) : null;
        if (overCut) violations.push({ property: "cut-size", detail: overCut });
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
          const stretched = offAspect(media, bytes, slideKind);
          if (stretched) violations.push({ property: "background-aspect", detail: stretched });
          const over = overScreen(media, bytes, slideOnScreen);
          if (over) violations.push({ property: "screen-size", detail: over });
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
      embedded.reduce((sum, b) => sum + (b?.byteLength ?? 0), 0) + (backgroundImage?.byteLength ?? 0);
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
