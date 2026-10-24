// src/lib/ppt/getSlideAspect.ts
import JSZip from "jszip";

export interface SlideAspect {
  /** "16:9" | "4:3" | "other" — drives the preview frame aspect-ratio. */
  kind: "16:9" | "4:3" | "other";
  /** width / height. */
  ratio: number;
}

const R_16_9 = 16 / 9;
const R_4_3 = 4 / 3;
const TOL = 0.02;

export function aspectFromSldSz(cx: number, cy: number): SlideAspect {
  if (!cx || !cy || cx <= 0 || cy <= 0) {
    return { kind: "16:9", ratio: R_16_9 };
  }
  const ratio = cx / cy;
  if (Math.abs(ratio - R_16_9) < TOL) return { kind: "16:9", ratio };
  if (Math.abs(ratio - R_4_3) < TOL) return { kind: "4:3", ratio };
  return { kind: "other", ratio };
}

/** PowerPoint's default slide (16:9, EMU), for a deck that declares no size. */
export const DEFAULT_SLIDE = { w: 12192000, h: 6858000 };

/**
 * The slide size `<p:sldSz>` declares in presentation.xml, its attributes in
 * any order; null when it is missing or not positive.
 */
export function slideSizeFromXml(xml: string): { w: number; h: number } | null {
  const tag = xml.match(/<p:sldSz\b[^>]*>/)?.[0];
  if (!tag) return null;
  const attr = (name: string) => Number(tag.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  const [w, h] = [attr("cx"), attr("cy")];
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Read ppt/presentation.xml <p:sldSz cx cy/> and classify. Never throws. */
export async function getSlideAspect(file: File): Promise<SlideAspect> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("ppt/presentation.xml")?.async("text");
    const size = xml ? slideSizeFromXml(xml) : null;
    if (!size) return { kind: "16:9", ratio: R_16_9 };
    return aspectFromSldSz(size.w, size.h);
  } catch {
    return { kind: "16:9", ratio: R_16_9 };
  }
}
