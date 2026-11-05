import PptxGenJS from "pptxgenjs";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import {
  containedSize,
  sizedImagePreparation,
  type PixelSize,
  type PreparedImage,
  type ScreenSize,
  type SizedImagePreparation,
} from "@/lib/image/slideImage";
import { runOutputCheck } from "@/lib/output-check/core";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";
import { computeSlidePlacement, type Box, type PlacementAlign } from "./slidePlacement";
import { downscaleForSlide, SLIDE_IMAGE_MAX_LONG_EDGE } from "./downscaleForSlide";
import { checkImageToPptx } from "./imageToPptxCheck";

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; dataUrl: string };
export interface PlacedImage { dataUrl: string; placement: Box; }
export interface AssembleOptions { slideKind: SlideKind; background: Background; screen: ScreenSize; }

const BG_MASTER = "ONTAB_BG";

/**
 * pptxgenjs names a background part, and picks its content type, by the
 * extension of `path`; given only `data` it assumes PNG, so a JPEG would be
 * stored as `.png` (#74). The downscaler encodes only these two; anything
 * else (e.g. `data:,` from a canvas that could not allocate) is the tool's
 * failure, reported as corrupt output.
 */
const BACKGROUND_PATH_OF_MIME: Readonly<Record<string, string>> = {
  "image/png": "background.png",
  "image/jpeg": "background.jpeg",
};

function backgroundPath(dataUrl: string): string {
  const mime = dataUrl.slice("data:".length).split(/[;,]/)[0];
  const path = BACKGROUND_PATH_OF_MIME[mime];
  if (!path) {
    throw new Error(`${CORRUPT_OUTPUT_PREFIX}: image-to-pptx: background encoded as "${mime}"`);
  }
  return path;
}

/** Low-level: caller supplies already-prepared data URLs + placements. */
export async function assemblePptxFromPlaced(images: PlacedImage[], opts: AssembleOptions): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  const size = SLIDE_SIZES[opts.slideKind];
  pptx.defineLayout({ name: "ONTAB", width: size.w, height: size.h });
  pptx.layout = "ONTAB";
  // Define the (deck-wide) background ONCE on a slide master and let every slide
  // inherit it. Setting `slide.background` per slide makes pptxgenjs embed the
  // image a fresh copy each time → an N-slide deck stored N copies of the same
  // background (file bloat; re-extraction yielded N duplicate images). A master
  // background is stored a single time. Also mirrors ppt-background's single
  // shared-media model for cross-tool consistency.
  const masterBg =
    opts.background.kind === "color"
      ? { color: opts.background.color }
      : { data: opts.background.dataUrl, path: backgroundPath(opts.background.dataUrl) };
  pptx.defineSlideMaster({ title: BG_MASTER, background: masterBg });
  for (const img of images) {
    const slide = pptx.addSlide({ masterName: BG_MASTER });
    const p = img.placement;
    slide.addImage({ data: img.dataUrl, x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

export interface BuildPptxInput {
  files: File[];
  box: Box; // inches on the slide
  slideKind: SlideKind;
  background: { kind: "color"; color: string } | { kind: "image"; file: File };
  align: PlacementAlign;
  /** The screen the deck's pictures are sized for (CONTEXT "Screen size"). */
  screen: ScreenSize;
}
export type DownscaleForSlide = typeof downscaleForSlide;

/** Bytes per `String.fromCharCode` call: bounds its argument count. */
const BASE64_CHUNK = 0x8000;

/** A prepared picture as the data URL pptxgenjs embeds, naming its real format. */
function dataUrlOf({ bytes, format }: PreparedImage): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK));
  }
  return `data:image/${format};base64,${btoa(binary)}`;
}

/**
 * A slide picture as it enters the deck: whole, at its contained size for the
 * slide on the screen. The size follows the slide, not the placement box, so
 * a picture placed small stays sharp when enlarged in PowerPoint, and
 * ppt-compress can remove the excess later. `upright` is the picture's own
 * shape, which placement uses.
 */
export async function prepareSlidePicture(
  file: File,
  slideKind: SlideKind,
  screen: ScreenSize,
  preparation: SizedImagePreparation,
): Promise<{ dataUrl: string; upright: PixelSize }> {
  const upright = await preparation.measure(file);
  const uncut = { x: 0, y: 0, ...upright };
  const size = containedSize(upright, SLIDE_SIZES[slideKind], screen);
  return { dataUrl: dataUrlOf(await preparation.prepare(file, uncut, size)), upright };
}

/**
 * image-to-pptx's engine entry: prepare each file, compute placement,
 * assemble, then the tool's output check (see `imageToPptxCheck.ts`). A
 * failing check has no safer mode to fall back to, so it blocks with the
 * corrupt-output error. `preparation` and `downscaleBackground` are the
 * browser's canvas; tests in Node pass stand-ins.
 */
export async function buildPptx(
  input: BuildPptxInput,
  onProgress?: (pct: number) => void,
  preparation: SizedImagePreparation = sizedImagePreparation,
  downscaleBackground: DownscaleForSlide = downscaleForSlide,
): Promise<Uint8Array> {
  const boxInches: Box = input.box;
  let background: Background;
  if (input.background.kind === "color") background = { kind: "color", color: input.background.color };
  else {
    const bg = await downscaleBackground(input.background.file, SLIDE_IMAGE_MAX_LONG_EDGE);
    background = { kind: "image", dataUrl: bg.dataUrl };
  }
  const placed: PlacedImage[] = [];
  const total = input.files.length;
  for (let i = 0; i < total; i++) {
    const { dataUrl, upright } = await prepareSlidePicture(input.files[i], input.slideKind, input.screen, preparation);
    placed.push({ dataUrl, placement: computeSlidePlacement(boxInches, upright.width, upright.height, input.align) });
    onProgress?.(Math.round(((i + 1) / total) * 90));
  }
  const options: AssembleOptions = { slideKind: input.slideKind, background, screen: input.screen };
  const bytes = await assemblePptxFromPlaced(placed, options);
  const checked = await runOutputCheck({
    tool: "image-to-pptx",
    output: bytes,
    check: (out) => checkImageToPptx(placed, options, out, "quick"),
  });
  onProgress?.(100);
  return checked;
}
