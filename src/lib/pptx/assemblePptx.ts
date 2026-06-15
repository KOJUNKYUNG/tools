import PptxGenJS from "pptxgenjs";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";
import { computeSlidePlacement, type Box, type PlacementAlign } from "./slidePlacement";
import { downscaleForSlide, SLIDE_IMAGE_MAX_LONG_EDGE } from "./downscaleForSlide";

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; dataUrl: string };
export interface PlacedImage { dataUrl: string; placement: Box; }
export interface AssembleOptions { slideKind: SlideKind; background: Background; }

const BG_MASTER = "ONTAB_BG";

/** Low-level: caller supplies already-downscaled data URLs + placements. */
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
      : { data: opts.background.dataUrl };
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
}
/** High-level: downscale each file, compute placement, assemble. */
export async function buildPptx(input: BuildPptxInput, onProgress?: (pct: number) => void): Promise<Uint8Array> {
  const boxInches: Box = input.box;
  let background: Background;
  if (input.background.kind === "color") background = { kind: "color", color: input.background.color };
  else {
    const bg = await downscaleForSlide(input.background.file, SLIDE_IMAGE_MAX_LONG_EDGE);
    background = { kind: "image", dataUrl: bg.dataUrl };
  }
  const placed: PlacedImage[] = [];
  const total = input.files.length;
  for (let i = 0; i < total; i++) {
    const d = await downscaleForSlide(input.files[i], SLIDE_IMAGE_MAX_LONG_EDGE);
    placed.push({ dataUrl: d.dataUrl, placement: computeSlidePlacement(boxInches, d.w, d.h, input.align) });
    onProgress?.(Math.round(((i + 1) / total) * 90));
  }
  const bytes = await assemblePptxFromPlaced(placed, { slideKind: input.slideKind, background });
  onProgress?.(100);
  return bytes;
}
