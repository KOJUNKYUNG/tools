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

/** Read ppt/presentation.xml <p:sldSz cx cy/> and classify. Never throws. */
export async function getSlideAspect(file: File): Promise<SlideAspect> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("ppt/presentation.xml")?.async("text");
    const m = xml?.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (!m) return { kind: "16:9", ratio: R_16_9 };
    return aspectFromSldSz(parseInt(m[1], 10), parseInt(m[2], 10));
  } catch {
    return { kind: "16:9", ratio: R_16_9 };
  }
}
