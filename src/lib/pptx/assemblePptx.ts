import PptxGenJS from "pptxgenjs";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import type { RunBackground } from "@/lib/background/resolveBackground";
import { maxFitCrop, type CropRect } from "@/lib/image/maxFitCrop";
import {
  containedSize,
  fittedSize,
  shownPartSize,
  sizedImagePreparation,
  type PixelSize,
  type PreparedImage,
  type PrepareStep,
  type ScreenSize,
  type SizedImagePreparation,
} from "@/lib/image/slideImage";
import { runOutputCheck } from "@/lib/output-check/core";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";
import { computeSlidePlacement, cutAtSlide, type Box, type PlacementAlign } from "./slidePlacement";
import { checkImageToPptx } from "./imageToPptxCheck";

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; dataUrl: string };
/**
 * A slide's picture as the engine placed it: its prepared data, null when it
 * lies wholly off the slide, and its rectangle on the slide in inches. `cut`
 * marks one that reached past the slide's edge and holds only its visible part.
 */
export interface PlacedImage { dataUrl: string | null; placement: Box; cut?: boolean; }
export interface AssembleOptions { slideKind: SlideKind; background: Background; screen: ScreenSize; }

const BG_MASTER = "ONTAB_BG";

/**
 * pptxgenjs names a background part, and picks its content type, by the
 * extension of `path`; given only `data` it assumes PNG, so a JPEG would be
 * stored as `.png` (#74). The preparation encodes only these two; anything
 * else is the tool's failure, reported as corrupt output.
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
    if (img.dataUrl !== null) slide.addImage({ data: img.dataUrl, x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

export interface BuildPptxInput {
  files: File[];
  box: Box; // inches on the slide
  slideKind: SlideKind;
  background:
    | { kind: "color"; color: string }
    | {
        kind: "image";
        file: File;
        /** The Background crop, in the picture's upright pixels; centred and as large as possible when absent. */
        crop?: CropRect;
        /**
         * The preparation step, such as the filter set baked in: run on the
         * crop fitted to the deck's screen, before its format is chosen.
         */
        step?: PrepareStep;
      };
  align: PlacementAlign;
  /** The screen the deck's pictures are sized for (CONTEXT "Screen size"). */
  screen: ScreenSize;
}

/**
 * The background the tool resolved for the run (`resolveBackground`) as this
 * engine takes it: a colour fill, or a picture with its crop and step. A new
 * deck has no theme background for "no background" to mean.
 */
export function engineBackground(background: RunBackground): BuildPptxInput["background"] {
  if (background.kind === "picture") return { kind: "image", file: background.file, crop: background.crop, step: background.step };
  if (background.fill.kind !== "colour") throw new Error("image-to-pptx: a new deck has no theme background");
  return { kind: "color", color: background.fill.rgb };
}

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
 * A slide picture placed in the deck's placement box, as it enters its slide
 * (CONTEXT "Placement"), placed by its upright shape:
 *
 * - within the slide, whole at its contained size for the slide on the
 *   screen. The size follows the slide, not the placement box, so a picture
 *   placed small stays sharp when enlarged in PowerPoint, and ppt-compress
 *   can remove the excess later.
 * - past the slide's edge, only the part on the slide, cut from the picture,
 *   at `shownPartSize` and placed where it shows.
 * - wholly off the slide, nothing (`dataUrl` null): the slide shows the
 *   background alone.
 */
export async function placeSlidePicture(
  file: File,
  box: Box,
  align: PlacementAlign,
  slideKind: SlideKind,
  screen: ScreenSize,
  preparation: SizedImagePreparation,
): Promise<PlacedImage> {
  const slide = SLIDE_SIZES[slideKind];
  const upright = await preparation.measure(file);
  const placement = computeSlidePlacement(box, upright.width, upright.height, align);
  const cut = cutAtSlide(placement, slide.w, slide.h, upright);
  if (cut.kind === "whole") {
    const size = containedSize(upright, slide, screen);
    const dataUrl = dataUrlOf(await preparation.prepare(file, { x: 0, y: 0, ...upright }, size));
    return { dataUrl, placement, cut: false };
  }
  if (cut.kind === "hidden") return { dataUrl: null, placement, cut: true };
  const share = { w: cut.rect.w / slide.w, h: cut.rect.h / slide.h };
  const size = shownPartSize(cut.crop, share, slide, screen);
  return { dataUrl: dataUrlOf(await preparation.prepare(file, cut.crop, size)), placement: cut.rect, cut: true };
}

/**
 * The background picture as it enters the deck: cut to its Background crop of
 * the slide's aspect (the one the user placed, or else the centred one), which
 * is what the tool's preview shows, then fitted to the deck's screen, then
 * `step` (the filter set) when given. The engine takes it as a plain picture
 * file, whatever its source: an edited recipe or a filtered solid colour is
 * drawn to a file by the tool before the run (`resolveBackground`).
 */
export async function prepareBackgroundPicture(
  file: File,
  slideKind: SlideKind,
  screen: ScreenSize,
  preparation: SizedImagePreparation,
  placed?: CropRect,
  step?: PrepareStep,
): Promise<string> {
  const slide = SLIDE_SIZES[slideKind];
  const crop = placed ?? (await centredCrop(file, slide, preparation));
  return dataUrlOf(await preparation.prepare(file, crop, fittedSize(crop, slide, screen), step));
}

async function centredCrop(file: File, slide: { w: number; h: number }, preparation: SizedImagePreparation) {
  const upright = await preparation.measure(file);
  return maxFitCrop({ w: upright.width, h: upright.height }, slide.w, slide.h);
}

/**
 * image-to-pptx's engine entry: prepare each file, compute placement,
 * assemble, then the tool's output check (see `imageToPptxCheck.ts`). A
 * failing check has no safer mode to fall back to, so it blocks with the
 * corrupt-output error. `preparation` is the browser's canvas; tests in Node
 * pass a stand-in.
 */
export async function buildPptx(
  input: BuildPptxInput,
  onProgress?: (pct: number) => void,
  preparation: SizedImagePreparation = sizedImagePreparation,
): Promise<Uint8Array> {
  const boxInches: Box = input.box;
  let background: Background;
  if (input.background.kind === "color") background = { kind: "color", color: input.background.color };
  else {
    const { file, crop, step } = input.background;
    const dataUrl = await prepareBackgroundPicture(file, input.slideKind, input.screen, preparation, crop, step);
    background = { kind: "image", dataUrl };
  }
  const placed: PlacedImage[] = [];
  const total = input.files.length;
  for (let i = 0; i < total; i++) {
    placed.push(await placeSlidePicture(input.files[i], boxInches, input.align, input.slideKind, input.screen, preparation));
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
